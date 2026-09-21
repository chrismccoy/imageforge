/**
 * Shared collection test setup
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
const schema = require("../../../db/schema");
const fs = require("fs");
const { uploadPath } = require("../../../utils/files/uploads");
const { UPLOAD_DIR } = require("../../../config/paths");

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

function withFiles(rows) {
  const written = rows.map((row) => uploadPath(row.filename, UPLOAD_DIR).full);
  written.forEach((full) => fs.writeFileSync(full, PNG));
  return () =>
    written.forEach((full) => {
      try {
        fs.unlinkSync(full);
      } catch (err) {
        if (err.code !== "ENOENT") throw err;
      }
    });
}

const NOW = "2026-08-10T10:00:00.000Z";

function freshDb() {
  const db = new Database(":memory:");
  schema.init(db);
  return db;
}

function models(db) {
  return require("../../../models").buildModels(db);
}

function anImage(db, prompt) {
  return Number(
    models(db).Generation.add({
      filename: `${process.pid}-${prompt.replace(/\s/g, "-")}.png`,
      prompt,
      model: "gpt-image-2",
      size: "1024x1024",
    })
  );
}

function tokens(...values) {
  const queue = values.slice();
  return () => queue.shift();
}

function at(db, id, iso) {
  db.prepare("UPDATE generations SET created_at = ? WHERE id = ?").run(iso, id);
}

const { createApp } = require("../../../server");

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

  const after = await fetch(`${base}/collections`, { headers: { cookie } });
  const csrf = /name="_csrf" value="([^"]+)"/.exec(await after.text())[1];
  return { cookie, csrf };
}

function post(base, path, cookie, fields) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams(fields).toString(),
    redirect: "manual",
  });
}

function shared(db, { title = "Winter campaign", images = ["a cat"] } = {}) {
  const { Collection, Settings } = models(db);
  Settings.update({ public_collections: 1 });

  const id = Collection.add("Acme Corp rebrand", NOW);
  const ids = images.map((prompt) => anImage(db, prompt));
  ids.forEach((imageId) => Collection.addImage(imageId, id));
  const token = Collection.share(id, title, tokens("SHAREDTOK1"));
  return { id, token, ids };
}

module.exports = {
  PNG,
  withFiles,
  NOW,
  freshDb,
  models,
  anImage,
  tokens,
  at,
  startApp,
  cookieFrom,
  signIn,
  post,
  shared,
};
