/**
 * Generate model tests
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
const schema = require("../../db/schema");

const openai = require("../../services/openai");
const seen = [];
openai.generateImage = async (opts) => {
  seen.push(opts.model);
  return {
    model: "gpt-image-x",
    bytes: Buffer.from("PNG"),
    dataUrl: "data:image/png;base64,UE5H",
    usage: null,
  };
};

const { createApp } = require("../../server");

async function startApp(db) {
  const app = createApp({ db });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    stop: () => server.close(),
  };
}

function cookieFrom(res) {
  const set = res.headers.getSetCookie();
  return set && set.length ? set.map((c) => c.split(";")[0]).join("; ") : null;
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

  const after = await fetch(`${base}/`, { headers: { cookie } });
  const csrf = /name="csrf-token" content="([^"]*)"/.exec(await after.text())[1];
  return { cookie, csrf };
}

test("the posted model is used, and its absence falls back to settings", async () => {
  const db = new Database(":memory:");
  schema.init(db);

  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);
    const call = (body) =>
      fetch(`${app.base}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
          cookie,
        },
        body: JSON.stringify(body),
      });

    await call({ prompt: "a cat", size: "1024x1024", model: "2" });
    await call({ prompt: "a cat", size: "1024x1024" });

    assert.equal(seen[0], "2", "the posted model is honoured");
    assert.equal(seen[1], "1.5", "no model falls back to the setting");
  } finally {
    app.stop();
    db.close();
  }
});

const { normalizeCount, ALLOWED_COUNTS } = require("../../config/images");

test("normalizeCount accepts the counts the app offers", () => {
  for (const count of ALLOWED_COUNTS) {
    assert.equal(normalizeCount(String(count)), count);
    assert.equal(normalizeCount(count), count);
  }
});

test("normalizeCount falls back rather than failing", () => {
  assert.equal(normalizeCount(undefined), 1);
  assert.equal(normalizeCount(""), 1);
  assert.equal(normalizeCount("3"), 1, "not in the catalogue");
  assert.equal(normalizeCount("99"), 1);
  assert.equal(normalizeCount("-4"), 1);
  assert.equal(normalizeCount("banana"), 1);
  assert.equal(normalizeCount(null), 1);
});

test("normalizeCount takes a fallback of its own", () => {
  assert.equal(normalizeCount("nonsense", 4), 4);
});
