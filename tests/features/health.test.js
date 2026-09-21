/**
 * Health route tests
 */

"use strict";

process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.NODE_ENV = "test";
process.env.ALLOWED_IPS = "198.51.100.7";
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

test("health answers without a session", async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /application\/json/);
  assert.deepEqual(await res.json(), { ok: true });
});

test("health answers from an address the allow list refuses", async () => {
  const denied = await fetch(`${base}/generations`, { redirect: "manual" });
  assert.notEqual(denied.status, 200);

  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
});

test("health says nothing about the install", async () => {
  const body = await (await fetch(`${base}/health`)).text();
  assert.equal(body.includes("version"), false);
  assert.equal(body.length < 40, true);
});
