/**
 * App factory tests
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";

const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const { createApp } = require("../../server");
const { quietLog } = require("../helpers/quietLog");
const { attrTag } = require("../helpers/dom");

let server;
let base;
let app;

test.before(async () => {
  const db = new Database(":memory:");
  app = createApp({ db, log: quietLog() });
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

test("createApp builds models over the injected database and seeds settings", () => {
  const settings = app.get("deps").models.Settings.get();
  assert.ok(settings, "settings row should be seeded");
  assert.equal(settings.default_size, "1024x1024");
});

test("public login page is served from the in-memory app", async () => {
  const res = await fetch(`${base}/login`);
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /Log in/);
});

test("a prompt written through the injected model is read back", () => {
  const { Prompt } = app.get("deps").models;
  Prompt.add("greeting", "say hello");
  const names = Prompt.all().map((p) => p.name);
  assert.ok(names.includes("greeting"));
});

function cookieFrom(res) {
  const set = res.headers.getSetCookie();
  return set && set.length ? set.map((c) => c.split(";")[0]).join("; ") : null;
}

async function loginPage() {
  const res = await fetch(`${base}/login`);
  const html = await res.text();
  return {
    csrf: /name="_csrf" value="([^"]+)"/.exec(html)[1],
    cookie: cookieFrom(res),
    html,
  };
}

test("the login form posts to /login with its csrf field and both fields' autocomplete", async () => {
  const { html } = await loginPage();
  const form = attrTag(html, "action", "form");
  assert.ok(form, "no <form> with an action attribute found");
  assert.match(form, /action="\/login"/);
  assert.match(form, /method="post"/);
  assert.match(form, /name="_csrf"/);
  const user = /<input\b[^>]*\bname="username"[^>]*>/.exec(form);
  assert.ok(user, "no username input found");
  assert.match(user[0], /autocomplete="username"/);
  const pass = /<input\b[^>]*\bname="password"[^>]*>/.exec(form);
  assert.ok(pass, "no password input found");
  assert.match(pass[0], /autocomplete="current-password"/);
});

test("a correct login authenticates and reaches the dashboard", async () => {
  const { csrf, cookie } = await loginPage();
  const res = await fetch(`${base}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie },
    body: `_csrf=${csrf}&username=admin&password=test-pass`,
    redirect: "manual",
  });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "/");

  const authedCookie = cookieFrom(res) || cookie;
  const dashboard = await fetch(`${base}/`, { headers: { cookie: authedCookie } });
  assert.equal(dashboard.status, 200);
});

test("a wrong password fails and shows its message as a notice-error", async () => {
  const { csrf, cookie } = await loginPage();
  const res = await fetch(`${base}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie },
    body: `_csrf=${csrf}&username=admin&password=wrong-password`,
  });
  assert.equal(res.status, 401);
  const body = await res.text();
  const notice = attrTag(body, "notice-error", "div");
  assert.ok(notice, "no .notice.notice-error found");
  assert.match(notice, /Wrong username or password\./);
});

test("the failed-login notice announces itself to assistive technology", async () => {
  const { csrf, cookie } = await loginPage();
  const res = await fetch(`${base}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie },
    body: `_csrf=${csrf}&username=admin&password=wrong-password`,
  });
  const body = await res.text();
  const notice = attrTag(body, "notice-error", "div");
  assert.ok(notice, "no .notice.notice-error found");
  assert.match(notice, /role="alert"/);
});

test("the login page draws no emoji", async () => {
  const { html } = await loginPage();
  assert.doesNotMatch(html, /[\u{1F300}-\u{1FAFF}\u{2190}-\u{2BFF}]/u);
});
