/**
 * Public access tests
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.PUBLIC_SHARE = "";
process.env.PUBLIC_GALLERY = "";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";

const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveToggle } = require("../../services/publicAccess");

test("a saved toggle wins over the environment", () => {
  assert.equal(resolveToggle(1, false), true);
  assert.equal(resolveToggle(0, true), false);
});

test("an unsaved toggle falls back to the environment", () => {
  assert.equal(resolveToggle(null, true), true);
  assert.equal(resolveToggle(null, false), false);
  assert.equal(resolveToggle(undefined, true), true);
});

test("junk in the column falls back rather than throwing", () => {
  assert.equal(resolveToggle("yes", true), true);
  assert.equal(resolveToggle("yes", false), false);
});

const Database = require("better-sqlite3");
const schema = require("../../db/schema");
const buildSettings = require("../../models/settings");

function freshDb() {
  const db = new Database(":memory:");
  schema.init(db);
  return db;
}

test("a fresh database has both toggle columns, unset", () => {
  const db = freshDb();
  const Settings = buildSettings(db);
  const row = Settings.get();
  assert.equal(row.public_share, null);
  assert.equal(row.public_gallery, null);
  db.close();
});

test("the toggles round-trip and are left alone when not mentioned", () => {
  const db = freshDb();
  const Settings = buildSettings(db);

  Settings.update({ public_share: 1, public_gallery: 0 });
  let row = Settings.get();
  assert.equal(row.public_share, 1);
  assert.equal(row.public_gallery, 0);

  Settings.update({ page_size: "5" });
  row = Settings.get();
  assert.equal(row.public_share, 1);
  assert.equal(row.public_gallery, 0);
  assert.equal(row.page_size, 5);
  db.close();
});

const { createPublicAccess } = require("../../services/publicAccess");

test("the access service follows the saved settings", () => {
  const db = freshDb();
  const Settings = buildSettings(db);
  const access = createPublicAccess(Settings);

  assert.equal(access.sharing(), false, "unset falls back to the env, off here");
  assert.equal(access.gallery(), false);

  Settings.update({ public_share: 1, public_gallery: 1 });
  assert.equal(access.sharing(), true, "a save takes effect with no rebuild");
  assert.equal(access.gallery(), true);

  Settings.update({ public_share: 0 });
  assert.equal(access.sharing(), false);
  db.close();
});

const { createApp } = require("../../server");

function cookieFrom(res) {
  const set = res.headers.getSetCookie();
  if (!set || !set.length) return null;
  return set.map((c) => c.split(";")[0]).join("; ");
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

  const after = await fetch(`${base}/settings`, { headers: { cookie } });
  const csrf = /name="_csrf" value="([^"]+)"/.exec(await after.text())[1];
  return { cookie, csrf };
}

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

test("the settings form saves both toggles", async () => {
  const db = freshDb();
  const Settings = buildSettings(db);
  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);

    await saveSettings(app.base, cookie, csrf, {
      public_share: "on",
      public_gallery: "on",
    });
    let row = Settings.get();
    assert.equal(row.public_share, 1);
    assert.equal(row.public_gallery, 1);

    await saveSettings(app.base, cookie, csrf, {});
    row = Settings.get();
    assert.equal(row.public_share, 0, "an absent checkbox saves an explicit off");
    assert.equal(row.public_gallery, 0);
  } finally {
    app.stop();
    db.close();
  }
});

test("a gallery without sharing is refused by the form", async () => {
  const db = freshDb();
  const Settings = buildSettings(db);
  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);
    const res = await saveSettings(app.base, cookie, csrf, {
      public_gallery: "on",
      page_size: "7",
    });

    assert.match(await res.text(), /gallery needs public sharing/i);

    const row = Settings.get();
    assert.equal(row.public_gallery, null, "nothing is written");
    assert.equal(row.page_size, 0, "not even the valid fields");
  } finally {
    app.stop();
    db.close();
  }
});

test("the settings page shows the toggles", async () => {
  const db = freshDb();
  const app = await startApp(db);
  try {
    const { cookie } = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/settings`, { headers: { cookie } })
    ).text();
    assert.match(html, /name="public_share"/);
    assert.match(html, /name="public_gallery"/);
  } finally {
    app.stop();
    db.close();
  }
});
