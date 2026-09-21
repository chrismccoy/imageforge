/**
 * Test harness
 */

"use strict";

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const schema = require("../../db/schema");
const { createApp } = require("../../server");
const { UPLOAD_DIR } = require("../../config/paths");

const PNG_BYTES = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082",
  "hex"
);

function freshDb() {
  const db = new Database(":memory:");
  schema.init(db);
  return db;
}

function uploadFixture(label) {
  const filename = `${label}-${process.pid}.png`;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), PNG_BYTES);

  return {
    filename,
    remove: () => fs.rmSync(path.join(UPLOAD_DIR, filename), { force: true }),
  };
}

async function startApp(options) {
  const app = createApp(options);
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

async function signIn(base, { username = "admin", password = "test-pass" } = {}) {
  const page = await fetch(`${base}/login`);
  const csrf = /name="_csrf" value="([^"]+)"/.exec(await page.text())[1];
  const first = cookieFrom(page);

  const res = await fetch(`${base}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      cookie: first,
    },
    body: `_csrf=${csrf}&username=${username}&password=${password}`,
    redirect: "manual",
  });

  return cookieFrom(res) || first;
}

async function csrfFor(base, cookie, from = "/generations") {
  const page = await fetch(`${base}${from}`, { headers: { cookie } });
  const html = await page.text();
  const found = /name="csrf-token" content="([^"]*)"/.exec(html);
  return found ? found[1] : "";
}

module.exports = {
  PNG_BYTES,
  freshDb,
  uploadFixture,
  startApp,
  cookieFrom,
  signIn,
  csrfFor,
};
