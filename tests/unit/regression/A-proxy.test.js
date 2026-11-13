/**
 * Proxy trust, proxy check, origin and TLS-only settings regression tests
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "10.0.0.1";
process.env.TRUST_PROXY = "true";
process.env.PUBLIC_SHARE = "";
process.env.PUBLIC_GALLERY = "";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const config = require("../../../config/env");
const { env } = config;
const { proxyCheck } = require("../../../middleware/proxyCheck");
const { createSessionMiddleware } = require("../../../middleware/session");
const { createSecurityHeaders } = require("../../../middleware/securityHeaders");
const { originOf } = require("../../../utils/http/origin");
const { freshDb, startApp } = require("../../helpers/app");
const { quietLog } = require("../../helpers/quietLog");

async function listen(app) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    stop: () => server.close(),
  };
}

test("TRUST_PROXY=true trusts one hop, other values pass through", () => {
  assert.equal(typeof config.proxyTrust, "function");
  assert.equal(config.proxyTrust("true"), 1);
  assert.equal(config.proxyTrust("TRUE"), 1);
  assert.equal(config.proxyTrust("2"), 2);
  assert.equal(config.proxyTrust("loopback"), "loopback");
  assert.equal(config.proxyTrust("10.0.0.0/8"), "10.0.0.0/8");
  assert.equal(config.proxyTrust(""), false);
  assert.equal(config.proxyTrust("false"), false);
  assert.equal(config.proxyTrust("0"), false);
  assert.equal(env.TRUST_PROXY, true);
});

test("a spoofed left-most X-Forwarded-For does not pass the IP gate", async () => {
  const db = freshDb();
  const app = await startApp({ db, log: quietLog() });
  try {
    const spoofed = await fetch(`${app.base}/login`, {
      headers: { "x-forwarded-for": "127.0.0.1, 8.8.8.8" },
    });
    assert.equal(spoofed.status, 403, "the real client is 8.8.8.8");

    const real = await fetch(`${app.base}/login`, {
      headers: { "x-forwarded-for": "8.8.8.8, 10.0.0.1" },
    });
    assert.equal(real.status, 200, "the real client 10.0.0.1 is allowed");
  } finally {
    app.stop();
    db.close();
  }
});

test("rotating the left-most X-Forwarded-For does not reset a rate limit", async () => {
  const db = freshDb();
  const app = await startApp({
    db,
    log: quietLog(),
    limits: { rate: { share: { windowMs: 60000, max: 2 } } },
  });
  try {
    const statuses = [];
    for (let i = 1; i <= 4; i += 1) {
      const res = await fetch(`${app.base}/s/missing-token`, {
        headers: { "x-forwarded-for": `1.1.1.${i}, 10.0.0.1` },
      });
      statuses.push(res.status);
    }
    assert.equal(statuses[3], 429, `statuses: ${statuses}`);
  } finally {
    app.stop();
    db.close();
  }
});

function withTrust(value, run) {
  const original = env.TRUST_PROXY;
  env.TRUST_PROXY = value;
  try {
    return run();
  } finally {
    env.TRUST_PROXY = original;
  }
}

test("a local proxy with TRUST_PROXY off warns that the IP gate is open", () => {
  withTrust(false, () => {
    const warnings = [];
    const mw = proxyCheck((msg) => warnings.push(msg));
    mw(
      {
        headers: { "x-forwarded-for": "8.8.8.8" },
        socket: { remoteAddress: "::ffff:127.0.0.1" },
      },
      {},
      () => {}
    );
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /lets everyone in/);
    assert.doesNotMatch(warnings[0], /over-block/);
  });
});

test("the proxy check looks past the first request, once per problem", () => {
  withTrust(false, () => {
    const warnings = [];
    const mw = proxyCheck((msg) => warnings.push(msg));
    const local = { remoteAddress: "127.0.0.1" };
    mw({ headers: {}, socket: local }, {}, () => {});
    assert.equal(warnings.length, 0, "a local health check is fine");

    const proxied = { headers: { "x-forwarded-for": "8.8.8.8" }, socket: local };
    mw(proxied, {}, () => {});
    mw(proxied, {}, () => {});
    assert.equal(warnings.length, 1, "warned once");

    mw(
      {
        headers: { "x-forwarded-for": "8.8.8.8" },
        socket: { remoteAddress: "192.168.1.5" },
      },
      {},
      () => {}
    );
    assert.equal(warnings.length, 2, "a different problem warns again");
  });
});

test("the origin honours X-Forwarded-Host only under trust proxy", async () => {
  const build = (trust) => {
    const app = express();
    if (trust) app.set("trust proxy", 1);
    app.get("/", (req, res) => res.send(originOf(req)));
    return app;
  };
  const headers = { "x-forwarded-host": "public.example" };

  const trusted = await listen(build(true));
  const direct = await listen(build(false));
  try {
    const behind = await (await fetch(`${trusted.base}/`, { headers })).text();
    assert.equal(behind, "http://public.example");

    const raw = await (await fetch(`${direct.base}/`, { headers })).text();
    assert.equal(raw, direct.base, "a client's X-Forwarded-Host is ignored");
  } finally {
    trusted.stop();
    direct.stop();
  }
});

test("TRUST_PROXY alone does not make the session cookie Secure", async () => {
  const original = { trust: env.TRUST_PROXY, production: env.IS_PRODUCTION };
  env.TRUST_PROXY = true;
  env.IS_PRODUCTION = false;
  const db = freshDb();
  let middleware;
  try {
    middleware = createSessionMiddleware(db);
  } finally {
    env.TRUST_PROXY = original.trust;
    env.IS_PRODUCTION = original.production;
  }

  const app = express();
  app.set("trust proxy", 1);
  app.use(middleware);
  app.get("/", (req, res) => {
    req.session.seen = true;
    res.send("ok");
  });
  const server = await listen(app);
  try {
    const res = await fetch(`${server.base}/`);
    const cookies = res.headers.getSetCookie();
    assert.equal(cookies.length, 1, "the cookie is set over plain HTTP");
    assert.doesNotMatch(cookies[0], /Secure/i);
  } finally {
    server.stop();
    middleware.store.close();
    db.close();
  }
});

test("HSTS follows NODE_ENV=production, not TRUST_PROXY", () => {
  const sent = (settings) => {
    const set = {};
    createSecurityHeaders({ settings })(
      {},
      { setHeader: (name, value) => (set[name] = value) },
      () => {}
    );
    return set;
  };
  assert.equal(
    sent({ TRUST_PROXY: true, IS_PRODUCTION: false })["Strict-Transport-Security"],
    undefined
  );
  assert.match(
    sent({ TRUST_PROXY: false, IS_PRODUCTION: true })["Strict-Transport-Security"],
    /max-age=/
  );
});
