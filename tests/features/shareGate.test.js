/**
 * Share gate tests
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.PUBLIC_SHARE = "";
process.env.PUBLIC_GALLERY = "";

process.env.TRUST_PROXY = "true";
process.env.ALLOWED_IPS = "10.0.0.1";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const schema = require("../../db/schema");
const buildGeneration = require("../../models/generation");
const buildSettings = require("../../models/settings");
const { createApp } = require("../../server");
const { quietLog } = require("../helpers/quietLog");
const { UPLOAD_DIR } = require("../../config/paths");

const PNG_BYTES = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082",
  "hex"
);

const OUTSIDE = { "x-forwarded-for": "8.8.8.8" };
let gateFile;

test.before(() => {
  gateFile = `share-gate-${process.pid}.png`;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, gateFile), PNG_BYTES);
});

test.after(() => {
  fs.rmSync(path.join(UPLOAD_DIR, gateFile), { force: true });
});

async function startApp(db) {
  const app = createApp({ db, log: quietLog() });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    stop: () => server.close(),
  };
}

function dbWithSharedImage(token) {
  const db = new Database(":memory:");
  schema.init(db);
  const Generation = buildGeneration(db);
  Generation.add({
    filename: gateFile,
    prompt: "a gated cat",
    model: "",
    size: "",
  });
  Generation.setShareToken(Generation.all()[0].id, token);
  return db;
}

test("the sharing setting opens and closes the gate without a restart", async () => {
  const db = dbWithSharedImage("tok-runtime");
  const Settings = buildSettings(db);
  const app = await startApp(db);
  try {
    Settings.update({ public_share: 0 });
    let res = await fetch(`${app.base}/s/tok-runtime`, { headers: OUTSIDE });
    assert.equal(res.status, 403);

    Settings.update({ public_share: 1 });
    res = await fetch(`${app.base}/s/tok-runtime`, { headers: OUTSIDE });
    assert.equal(res.status, 200);

    const image = await fetch(`${app.base}/i/tok-runtime`, { headers: OUTSIDE });
    assert.equal(image.status, 200);

    Settings.update({ public_share: 0 });
    res = await fetch(`${app.base}/s/tok-runtime`, { headers: OUTSIDE });
    assert.equal(res.status, 403);
  } finally {
    app.stop();
    db.close();
  }
});

test("a local visitor reaches a share link whatever the setting says", async () => {
  const db = dbWithSharedImage("tok-local");
  buildSettings(db).update({ public_share: 0 });
  const app = await startApp(db);
  try {
    const res = await fetch(`${app.base}/s/tok-local`);
    assert.equal(res.status, 200);
  } finally {
    app.stop();
    db.close();
  }
});

test("public sharing does not open the dashboard", async () => {
  const db = dbWithSharedImage("tok-rest");
  buildSettings(db).update({ public_share: 1 });
  const app = await startApp(db);
  try {
    const res = await fetch(`${app.base}/generations`, {
      headers: OUTSIDE,
      redirect: "manual",
    });
    assert.equal(res.status, 403);
  } finally {
    app.stop();
    db.close();
  }
});

test("public visitors can load the stylesheet and scripts", async () => {
  const db = dbWithSharedImage("tok-assets");
  buildSettings(db).update({ public_share: 1 });
  const app = await startApp(db);
  try {
    const css = await fetch(`${app.base}/css/app.css`, { headers: OUTSIDE });
    assert.equal(css.status, 200);
    const js = await fetch(`${app.base}/js/share.js`, { headers: OUTSIDE });
    assert.equal(js.status, 200);
  } finally {
    app.stop();
    db.close();
  }
});
