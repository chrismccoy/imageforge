/**
 * The storage bar's percentage, in the attribute the script reads
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";
process.env.UPLOAD_QUOTA_MB = "1";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { startApp, signIn, freshDb } = require("../helpers/app");
const { dataWidget } = require("../helpers/dom");

const THIRTY_THREE_PERCENT_BYTES = 346030;

function seededUploadDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-bar-percent-"));
  fs.writeFileSync(
    path.join(dir, "seed.bin"),
    Buffer.alloc(THIRTY_THREE_PERCENT_BYTES)
  );
  return dir;
}

test("the sidebar's storage bar carries the real percent, not a full bar", async () => {
  const db = freshDb();
  const uploadDir = seededUploadDir();
  const app = await startApp({ db, folders: { uploadDir } });
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/`, { headers: { cookie } })
    ).text();

    const aside = /<aside[\s\S]*?<\/aside>/.exec(html)[0];
    assert.match(aside, /data-bar-percent="33"/);
  } finally {
    app.stop();
    db.close();
    fs.rmSync(uploadDir, { recursive: true, force: true });
  }
});

test("the dashboard KPI row's storage bar carries the real percent", async () => {
  const db = freshDb();
  const uploadDir = seededUploadDir();
  const app = await startApp({ db, folders: { uploadDir } });
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/`, { headers: { cookie } })
    ).text();

    const card = dataWidget(html, "storage", "section");
    assert.match(card, /data-bar-percent="33"/);
  } finally {
    app.stop();
    db.close();
    fs.rmSync(uploadDir, { recursive: true, force: true });
  }
});

test("the settings page's Storage card carries the real percent", async () => {
  const db = freshDb();
  const uploadDir = seededUploadDir();
  const app = await startApp({ db, folders: { uploadDir } });
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/settings`, { headers: { cookie } })
    ).text();

    const card = dataWidget(html, "settings-storage", "section");
    assert.match(card, /data-bar-percent="33"/);
  } finally {
    app.stop();
    db.close();
    fs.rmSync(uploadDir, { recursive: true, force: true });
  }
});

test("an empty folder's storage bar carries 0, not 33 and not blank", async () => {
  const db = freshDb();
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-bar-empty-"));
  const app = await startApp({ db, folders: { uploadDir } });
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/`, { headers: { cookie } })
    ).text();

    const aside = /<aside[\s\S]*?<\/aside>/.exec(html)[0];
    assert.match(aside, /data-bar-percent="0"/);
  } finally {
    app.stop();
    db.close();
    fs.rmSync(uploadDir, { recursive: true, force: true });
  }
});
