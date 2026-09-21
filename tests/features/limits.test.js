/**
 * The limits an app runs under
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";

const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveLimits, LIMITS } = require("../../config/limits");
const { startApp, freshDb, cookieFrom } = require("../helpers/app");

async function wrongPassword(base) {
  const page = await fetch(`${base}/login`);
  const csrf = /name="_csrf" value="([^"]+)"/.exec(await page.text())[1];

  return fetch(`${base}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      cookie: cookieFrom(page),
    },
    body: `_csrf=${csrf}&username=admin&password=wrong`,
    redirect: "manual",
  });
}

test("stating one window keeps the rest", () => {
  const limits = resolveLimits({ rate: { login: { windowMs: 1000, max: 1 } } });

  assert.deepEqual(limits.rate.login, { windowMs: 1000, max: 1 });
  assert.deepEqual(limits.rate.share, LIMITS.rate.share);
  assert.deepEqual(limits.rate.generate, LIMITS.rate.generate);
});

test("stating nothing is the defaults", () => {
  assert.deepEqual(resolveLimits(), LIMITS);
  assert.deepEqual(resolveLimits({}).rate, LIMITS.rate);
});

test("a ceiling can be stated without touching the windows", () => {
  const limits = resolveLimits({ uploadMaxBytes: 1 });

  assert.equal(limits.uploadMaxBytes, 1);
  assert.equal(limits.editMaxBytes, LIMITS.editMaxBytes);
  assert.deepEqual(limits.rate, LIMITS.rate);
});

test("an app built with a tighter login limit refuses the second attempt", async () => {
  const app = await startApp({
    db: freshDb(),
    limits: { rate: { login: { windowMs: 60000, max: 1 } } },
  });

  try {
    assert.equal(
      (await wrongPassword(app.base)).status,
      401,
      "the first attempt is answered"
    );
    assert.equal(
      (await wrongPassword(app.base)).status,
      429,
      "the second is over the limit"
    );
  } finally {
    app.stop();
  }
});

test("an app built with nothing stated keeps the shipped limit", async () => {
  const app = await startApp({ db: freshDb() });

  try {
    assert.equal((await wrongPassword(app.base)).status, 401);
    assert.equal(
      (await wrongPassword(app.base)).status,
      401,
      "and so is the second: the shipped ceiling is more than one"
    );
    assert.ok(LIMITS.rate.login.max > 1);
  } finally {
    app.stop();
  }
});
