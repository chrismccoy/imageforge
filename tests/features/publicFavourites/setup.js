/**
 * Public favourites test setup
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";

const Database = require("better-sqlite3");
const schema = require("../../../db/schema");
const { createApp } = require("../../../server");
const { uploadPath } = require("../../../utils/files/uploads");
const fs = require("fs");
const { UPLOAD_DIR } = require("../../../config/paths");

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
  return cookieFrom(res) || loginCookie;
}

async function signInWithCsrf(base, from = "/settings") {
  const cookie = await signIn(base);
  const html = await (
    await fetch(`${base}${from}`, { headers: { cookie } })
  ).text();
  return { cookie, csrf: /name="_csrf" value="([^"]+)"/.exec(html)[1] };
}

function withFiles(db, ids) {
  const written = ids.map(
    (id) => uploadPath(models(db).Generation.get(id).filename, UPLOAD_DIR).full
  );
  written.forEach((full) => fs.writeFileSync(full, PNG_BYTES));
  return () => written.forEach((full) => fs.rmSync(full, { force: true }));
}

const PNG_BYTES = Buffer.from(
  "89504e470d0a1a0a0000000d494844520000000100000001080600000" +
    "01f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082",
  "hex"
);

function shared(db, prompts = ["a starred cat"]) {
  const { Generation, Settings } = models(db);
  const ids = prompts.map((p) => anImage(db, p));
  ids.forEach((id) => Generation.toggleFavorite(id));
  Settings.update({ public_favourites: 1 });
  const token = Settings.shareFavourites(() => "FAVTOKEN01");
  return { ids, token };
}

function at(db, id, iso) {
  db.prepare("UPDATE generations SET created_at = ? WHERE id = ?").run(iso, id);
}

module.exports = {
  PNG_BYTES,
  withFiles,
  freshDb,
  models,
  anImage,
  startApp,
  cookieFrom,
  signIn,
  signInWithCsrf,
  shared,
  at,
};
