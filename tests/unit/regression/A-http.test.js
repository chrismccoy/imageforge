/**
 * HTTP helper, error handler, IP gate, public limiter, config and shutdown regression tests
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";
process.env.PUBLIC_SHARE = "";
process.env.PUBLIC_GALLERY = "";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const { wantsJson } = require("../../../utils/http/http");
const { createErrorHandler } = require("../../../middleware/errorHandler");
const { createIpAllow } = require("../../../middleware/ipAllow");
const { freshDb, startApp } = require("../../helpers/app");
const { quietLog } = require("../../helpers/quietLog");

function freshEnv() {
  delete require.cache[require.resolve("../../../config/env")];
  delete require.cache[require.resolve("../../../utils/security/secretBox")];
  return require("../../../config/env");
}

async function listen(app) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    stop: () => server.close(),
  };
}

test("wantsJson honours the CSRF header and an Accept that prefers JSON", async () => {
  const app = express();
  app.all("/prompts/1/pin", (req, res) => res.send(String(wantsJson(req))));
  const server = await listen(app);
  const ask = async (headers) =>
    (await fetch(`${server.base}/prompts/1/pin`, { headers })).text();
  try {
    assert.equal(await ask({ "x-csrf-token": "t" }), "true");
    assert.equal(await ask({ accept: "application/json" }), "true");
    assert.equal(await ask({ accept: "text/html,*/*;q=0.8" }), "false");
    assert.equal(await ask({ accept: "*/*" }), "false");
    assert.equal(await ask({}), "false");
  } finally {
    server.stop();
  }
});

test("a fetch-driven route answers a CSRF refusal in JSON", async () => {
  const db = freshDb();
  const app = await startApp({ db, log: quietLog() });
  try {
    const res = await fetch(`${app.base}/prompts/1/pin`, {
      method: "POST",
      headers: { "x-csrf-token": "wrong", "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(res.status, 403);
    assert.match(res.headers.get("content-type"), /application\/json/);
    assert.match((await res.json()).message, /CSRF/);
  } finally {
    app.stop();
    db.close();
  }
});

function handle(err) {
  const log = quietLog();
  const res = {
    headersSent: false,
    status(code) {
      if (!Number.isInteger(code) || code < 100 || code > 999) {
        throw new RangeError(`Invalid status code: ${code}`);
      }
      this.code = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  createErrorHandler({ log })(err, { originalUrl: "/api/x" }, res, () => {});
  return { res, log };
}

test("the error handler uses err.status only when it is a 4xx or 5xx integer", () => {
  for (const status of ["abc", 700, 200, 302, 404.5]) {
    const err = Object.assign(new Error("x"), { status });
    assert.equal(handle(err).res.code, 500, `status ${status}`);
  }
  assert.equal(
    handle(Object.assign(new Error("x"), { status: 503 })).res.code,
    503
  );
});

test("a 4xx is not logged as an unhandled error with a stack", () => {
  const err = Object.assign(new Error("bad body"), { status: 400, expose: true });
  const { res, log } = handle(err);
  assert.equal(res.code, 400);
  assert.equal(log.said(/Unhandled error/), false);
  assert.ok(log.said(/400/));
  assert.equal(
    log.lines.some((line) => line.level === "error"),
    false
  );

  const { log: serverLog } = handle(new Error("boom"));
  assert.ok(serverLog.said(/Unhandled error/));
});

test("allow-list entries match regardless of case and IPv6 spelling", () => {
  const ipAllow = createIpAllow({
    allowedIps: ["2001:DB8::1", "::FFFF:1.2.3.4", "2001:db8:0:0:0:0:0:2"],
  });
  const passes = (ip) => {
    let ok = false;
    const res = {
      status() {
        return this;
      },
      json() {
        return this;
      },
    };
    ipAllow({ ip, originalUrl: "/api/x" }, res, () => {
      ok = true;
    });
    return ok;
  };
  assert.ok(passes("2001:db8::1"));
  assert.ok(passes("2001:DB8:0::1"));
  assert.ok(passes("::ffff:1.2.3.4"));
  assert.ok(passes("1.2.3.4"));
  assert.ok(passes("2001:db8::2"));
  assert.equal(passes("2001:db8::3"), false);
  assert.equal(passes("8.8.8.8"), false);
});

test("public images have their own, higher limiter than the share pages", async () => {
  const db = freshDb();
  const app = await startApp({
    db,
    log: quietLog(),
    limits: { rate: { share: { windowMs: 60000, max: 2 } } },
  });
  try {
    const get = async (path) => (await fetch(`${app.base}${path}`)).status;

    for (const path of [
      "/i/missing.png",
      "/c/missing/i/1",
      "/f/missing/i/1/file",
    ]) {
      const statuses = [];
      for (let i = 0; i < 6; i += 1) statuses.push(await get(path));
      assert.equal(statuses.includes(429), false, `${path}: ${statuses}`);
    }

    const pages = [];
    for (let i = 0; i < 3; i += 1) pages.push(await get("/s/missing"));
    assert.equal(pages[2], 429, "the page limit still holds");
  } finally {
    app.stop();
    db.close();
  }
});

test("PUBLIC_GALLERY without PUBLIC_SHARE warns instead of refusing to start", () => {
  process.env.PUBLIC_GALLERY = "true";
  process.env.PUBLIC_SHARE = "";
  try {
    const fresh = freshEnv();
    assert.equal(
      fresh.configProblems().some((m) => /PUBLIC_GALLERY/.test(m)),
      false
    );
    const warnings = [];
    assert.doesNotThrow(() => fresh.assertConfig((msg) => warnings.push(msg)));
    assert.ok(warnings.some((m) => /PUBLIC_GALLERY requires PUBLIC_SHARE/.test(m)));
  } finally {
    process.env.PUBLIC_GALLERY = "";
    freshEnv();
  }
});

test("shutdown runs once, closes idle connections, and is forced after a grace period", async () => {
  const { createShutDown } = require("../../../server");
  assert.equal(typeof createShutDown, "function");

  const calls = [];
  const server = {
    close: () => calls.push("close"),
    closeIdleConnections: () => calls.push("idle"),
  };
  const exits = [];
  const shutDown = createShutDown({
    server,
    close: () => calls.push("deps"),
    exit: (code) => exits.push(code),
    graceMs: 20,
  });

  shutDown();
  shutDown();
  assert.deepEqual(calls, ["close", "idle"], "a second signal does nothing");

  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(exits, [1], "a hung close is forced to exit");
});
