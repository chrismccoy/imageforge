/**
 * API error format tests
 *
 * Everything under /api must answer with JSON
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";
process.env.PUBLIC_SHARE = "";
process.env.PUBLIC_GALLERY = "";

const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");

const { wantsJson } = require("../../utils/http/http");
const { createApp } = require("../../server");
const { quietLog } = require("../helpers/quietLog");

test("wantsJson sees through a mounted router", () => {
  assert.equal(
    wantsJson({ path: "/generate", originalUrl: "/api/generate" }),
    true
  );
  assert.equal(
    wantsJson({ path: "/api/generate", originalUrl: "/api/generate" }),
    true
  );
  assert.equal(
    wantsJson({ path: "/generations", originalUrl: "/generations" }),
    false
  );
  assert.equal(wantsJson({ path: "/", originalUrl: "/apixyz" }), false);
});

async function startApp(db) {
  const log = quietLog();
  const app = createApp({ db, log });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    log,
    stop: () => server.close(),
  };
}

function cookieFrom(res) {
  const set = res.headers.getSetCookie();
  if (!set || !set.length) return null;
  return set.map((c) => c.split(";")[0]).join("; ");
}

async function signIn(base) {
  const page = await fetch(`${base}/login`);
  const loginCsrf = /name="_csrf" value="([^"]+)"/.exec(await page.text())[1];
  const loginCookie = cookieFrom(page);

  const res = await fetch(`${base}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      cookie: loginCookie,
    },
    body: `_csrf=${loginCsrf}&username=admin&password=test-pass`,
    redirect: "manual",
  });
  const cookie = cookieFrom(res) || loginCookie;

  const after = await fetch(`${base}/generations`, { headers: { cookie } });
  const csrf = /name="_csrf" value="([^"]+)"/.exec(await after.text())[1];
  return { cookie, csrf };
}

test("a malformed JSON body is reported as JSON, not an HTML page", async () => {
  const db = new Database(":memory:");
  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);
    const res = await fetch(`${app.base}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie,
        "X-CSRF-Token": csrf,
      },
      body: "{not json",
    });

    assert.match(res.headers.get("content-type"), /application\/json/);
    const body = await res.json();
    assert.ok(body.message, "the reply carries a message");
  } finally {
    app.stop();
    db.close();
  }
});

test("the generate rate limit is reported as JSON, not an HTML page", async () => {
  const db = new Database(":memory:");
  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);

    let res;
    for (let i = 0; i < 33; i += 1) {
      res = await fetch(`${app.base}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie,
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({ prompt: "", size: "1024x1024" }),
      });
    }

    assert.equal(res.status, 429);
    assert.match(res.headers.get("content-type"), /application\/json/);
    assert.match((await res.json()).message, /Too many generations/);
  } finally {
    app.stop();
    db.close();
  }
});

test("what the error handler writes goes where the app was told to write", async () => {
  const db = new Database(":memory:");
  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);
    const res = await fetch(`${app.base}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf, cookie },
      body: "{not json",
    });

    assert.equal(res.status, 400, "the caller still gets an answer");
    assert.ok(
      app.log.said(/Unhandled error/),
      "and the detail goes where it was told"
    );
  } finally {
    app.stop();
    db.close();
  }
});
