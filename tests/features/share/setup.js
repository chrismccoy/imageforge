/**
 * Sharing test setup
 */

"use strict";

process.env.NODE_ENV = "test";

process.env.PUBLIC_SHARE = "";

process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";

process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";

const test = require("node:test");

const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const schema = require("../../../db/schema");
const buildGeneration = require("../../../models/generation");
const { createApp } = require("../../../server");
const { UPLOAD_DIR } = require("../../../config/paths");

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

function addGeneration(Generation, filename, prompt) {
  Generation.add({ filename, prompt, model: "1.5", size: "1024x1024" });
  return Generation.all().find((row) => row.filename === filename).id;
}

function useFixtureFile() {
  const it = { name: null };

  test.before(() => {
    it.name = `share-test-${process.pid}.png`;
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.writeFileSync(path.join(UPLOAD_DIR, it.name), PNG_BYTES);
  });

  test.after(() => {
    fs.rmSync(path.join(UPLOAD_DIR, it.name), { force: true });
  });

  return it;
}

function useSharedApp() {
  const file = useFixtureFile();
  const it = { base: null, db: null, id: null, file: null, server: null };

  test.before(async () => {
    it.file = file.name;
    it.db = new Database(":memory:");
    const app = createApp({ db: it.db });
    const Generation = buildGeneration(it.db);
    it.id = addGeneration(Generation, it.file, "a shared cat");
    Generation.setShareToken(it.id, "tok-shared");

    it.server = app.listen(0);
    await new Promise((resolve) => it.server.once("listening", resolve));
    it.base = `http://127.0.0.1:${it.server.address().port}`;
  });

  test.after(() => {
    it.server.close();
  });

  return it;
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
  if (!set || !set.length) return null;
  return set.map((c) => c.split(";")[0]).join("; ");
}

async function signIn(base) {
  const page = await fetch(`${base}/login`);
  const loginHtml = await page.text();
  const loginCsrf = /name="_csrf" value="([^"]+)"/.exec(loginHtml)[1];
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

module.exports = {
  PNG_BYTES,
  freshDb,
  addGeneration,
  useFixtureFile,
  useSharedApp,
  startApp,
  cookieFrom,
  signIn,
};
