/**
 * HTTP tests
 */

"use strict";

process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.NODE_ENV = "test";

process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";

const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const { createApp } = require("../../server");

let server;
let base;

test.before(async () => {
  const app = createApp({ db: new Database(":memory:") });
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

function cookieFrom(res) {
  const set = res.headers.getSetCookie();
  if (!set || !set.length) return null;
  return set.map((c) => c.split(";")[0]).join("; ");
}

function sidOf(cookie) {
  const m = /connect\.sid=([^;]+)/.exec(cookie || "");
  return m ? m[1] : null;
}

function csrfOf(html) {
  const m = /name="_csrf" value="([^"]+)"/.exec(html);
  return m ? m[1] : null;
}

async function loginPage() {
  const res = await fetch(`${base}/login`);
  const html = await res.text();
  return { cookie: cookieFrom(res), csrf: csrfOf(html), status: res.status };
}

async function signIn() {
  const { cookie, csrf } = await loginPage();
  const res = await fetch(`${base}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie },
    body: `_csrf=${csrf}&username=admin&password=test-pass`,
    redirect: "manual",
  });
  return cookieFrom(res);
}

test("GET /login renders and issues a CSRF token", async () => {
  const { status, cookie, csrf } = await loginPage();
  assert.equal(status, 200);
  assert.ok(cookie, "session cookie set");
  assert.ok(csrf, "csrf token present");
});

test("POST /login without a CSRF token is rejected (403)", async () => {
  const { cookie } = await loginPage();
  const res = await fetch(`${base}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie },
    body: "username=admin&password=test-pass",
    redirect: "manual",
  });
  assert.equal(res.status, 403);
});

test("POST /login with wrong password returns 401", async () => {
  const { cookie, csrf } = await loginPage();
  const res = await fetch(`${base}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie },
    body: `_csrf=${csrf}&username=admin&password=nope`,
    redirect: "manual",
  });
  assert.equal(res.status, 401);
});

test("successful login starts a new session id", async () => {
  const { cookie, csrf } = await loginPage();
  const before = sidOf(cookie);
  const res = await fetch(`${base}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie },
    body: `_csrf=${csrf}&username=admin&password=test-pass`,
    redirect: "manual",
  });
  assert.equal(res.status, 302);
  const after = sidOf(cookieFrom(res));
  assert.ok(after, "new session cookie issued");
  assert.notEqual(after, before, "session id changed on login");
});

test("404 is JSON for /api and HTML otherwise", async () => {
  const { cookie, csrf } = await loginPage();
  const login = await fetch(`${base}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie },
    body: `_csrf=${csrf}&username=admin&password=test-pass`,
    redirect: "manual",
  });
  const authed = cookieFrom(login);

  const apiRes = await fetch(`${base}/api/nope`, { headers: { cookie: authed } });
  assert.equal(apiRes.status, 404);
  assert.equal((await apiRes.json()).message, "Not found.");

  const pageRes = await fetch(`${base}/nope`, { headers: { cookie: authed } });
  assert.equal(pageRes.status, 404);
  assert.match(await pageRes.text(), /Page not found/);
});

test("the prompts list answers on both /prompts and /prompts/page/:page", async () => {
  const authed = await signIn();

  const first = await fetch(`${base}/prompts`, { headers: { cookie: authed } });
  assert.equal(first.status, 200);

  const paged = await fetch(`${base}/prompts/page/2`, {
    headers: { cookie: authed },
  });
  assert.equal(paged.status, 200);
});

test("security headers are present", async () => {
  const res = await fetch(`${base}/login`);
  assert.match(res.headers.get("content-security-policy"), /default-src 'self'/);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("x-frame-options"), "DENY");
});

test("login rate limiter eventually returns 429", async () => {
  const { cookie, csrf } = await loginPage();
  let last = 0;
  for (let i = 0; i < 15; i++) {
    const res = await fetch(`${base}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", cookie },
      body: `_csrf=${csrf}&username=admin&password=nope`,
      redirect: "manual",
    });
    last = res.status;
    if (last === 429) break;
  }
  assert.equal(last, 429);
});
