/**
 * The brand before anyone has opened the Settings page
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";
process.env.BRAND_NAME = "Env Studio";
process.env.BRAND_ICON = "fa-solid fa-star";

const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");

const schema = require("../../db/schema");
const { gapsBetween } = require("../../db/schemaDiff");
const { startApp, freshDb, signIn, csrfFor } = require("../helpers/app");

const BRAND_COLUMNS = ["brand_name", "brand_icon", "brand_mark"];

function saveSettings(base, cookie, csrf, fields) {
  const body = new URLSearchParams(
    Object.assign({ _csrf: csrf, default_size: "1024x1024", model: "1.5" }, fields)
  );
  return fetch(`${base}/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie },
    body: body.toString(),
  });
}

async function loginHtml(db) {
  const app = await startApp({ db });
  try {
    return await (await fetch(`${app.base}/login`)).text();
  } finally {
    app.stop();
  }
}

test("an unsaved brand comes from the environment", async () => {
  const db = freshDb();
  try {
    const html = await loginHtml(db);
    assert.match(html, /Env Studio/);
    assert.match(html, /fa-solid fa-star/);
    assert.doesNotMatch(html, /Image Forge/);
  } finally {
    db.close();
  }
});

test("a saved name wins over the environment, and clearing it hands back", async () => {
  const db = freshDb();
  const app = await startApp({ db });

  try {
    const cookie = await signIn(app.base);
    const csrf = await csrfFor(app.base, cookie, "/settings");

    await saveSettings(app.base, cookie, csrf, { brand_name: "Pixel Barn" });
    let html = await (await fetch(`${app.base}/login`)).text();
    assert.match(html, /Pixel Barn/);
    assert.doesNotMatch(html, /Env Studio/);

    await saveSettings(app.base, cookie, csrf, { brand_name: "" });
    html = await (await fetch(`${app.base}/login`)).text();
    assert.match(html, /Env Studio/);
  } finally {
    app.stop();
    db.close();
  }
});

test("a database migrated with what schema-gaps prints keeps its footer line", async () => {
  const want = new Database(":memory:");
  schema.init(want);

  const live = new Database(":memory:");
  schema.init(live);
  for (const column of BRAND_COLUMNS) {
    live.exec(`ALTER TABLE settings DROP COLUMN ${column}`);
  }

  const printed = gapsBetween(want, live)
    .filter((gap) => gap.kind === "column" && gap.table === "settings")
    .map((gap) => gap.sql);

  assert.deepEqual(printed, [
    "ALTER TABLE settings ADD COLUMN brand_name TEXT;",
    "ALTER TABLE settings ADD COLUMN brand_icon TEXT;",
    "ALTER TABLE settings ADD COLUMN brand_mark INTEGER;",
  ]);

  printed.forEach((sql) => live.exec(sql));
  assert.equal(
    live.prepare("SELECT brand_mark FROM settings").get().brand_mark,
    null
  );

  try {
    const html = await loginHtml(live);
    assert.match(html, /Env Studio/, "the environment still answers");
  } finally {
    want.close();
    live.close();
  }
});
