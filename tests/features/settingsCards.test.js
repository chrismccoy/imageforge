/**
 * The settings side cards
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "10.0.0.1,10.0.0.2";
process.env.TRUST_PROXY = "true";

const test = require("node:test");
const assert = require("node:assert/strict");

const { startApp, freshDb, cookieFrom } = require("../helpers/app");
const { dataWidget } = require("../helpers/dom");
const { buildModels } = require("../../models");

const PROXIED = { "x-forwarded-proto": "https" };

async function signInProxied(base) {
  const page = await fetch(`${base}/login`, { headers: PROXIED });
  const csrf = /name="_csrf" value="([^"]+)"/.exec(await page.text())[1];
  const first = cookieFrom(page);

  const res = await fetch(`${base}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      cookie: first,
      ...PROXIED,
    },
    body: `_csrf=${csrf}&username=admin&password=test-pass`,
    redirect: "manual",
  });

  return cookieFrom(res) || first;
}

async function settingsHtml(db) {
  const app = await startApp({ db });
  const cookie = await signInProxied(app.base);
  const html = await (
    await fetch(`${app.base}/settings`, { headers: { cookie, ...PROXIED } })
  ).text();
  app.stop();
  return html;
}

test("the storage card shows the quota", async () => {
  const db = freshDb();
  const html = await settingsHtml(db);
  const card = dataWidget(html, "settings-storage", "section");

  assert.match(card, /of \d+(\.\d+)?\s?(B|KB|MB|GB)/);
  db.close();
});

test("the storage card offers no way to empty an empty trash", async () => {
  const db = freshDb();
  const html = await settingsHtml(db);
  const card = dataWidget(html, "settings-storage", "section");

  assert.doesNotMatch(card, /Empty the trash/);
  assert.doesNotMatch(card, /trash\/empty/);
  db.close();
});

test("the storage card empties the trash for real, once there is one to empty", async () => {
  const db = freshDb();
  const { Generation } = buildModels(db);
  const id = Number(
    Generation.add({
      filename: `${process.pid}-storage-card.png`,
      prompt: "a discarded sketch",
      model: "gpt-image-1.5",
      size: "1024x1024",
    })
  );
  Generation.trash(id);

  const html = await settingsHtml(db);
  const card = dataWidget(html, "settings-storage", "section");

  assert.match(
    card,
    /<form[^>]*action="\/trash\/empty"[^>]*method="post"[^>]*>[\s\S]*?name="_csrf"[\s\S]*?Empty the trash[\s\S]*?<\/form>/
  );
  db.close();
});

test("the access card states who is in and how they get in", async () => {
  const db = freshDb();
  const html = await settingsHtml(db);
  const card = dataWidget(html, "settings-access", "section");

  assert.match(card, /admin/);
  assert.match(card, /2 addresses/);
  assert.match(card, /Behind a proxy[\s\S]*?yes/);
  db.close();
});

test("the access card offers nothing to type in", async () => {
  const db = freshDb();
  const html = await settingsHtml(db);
  const card = dataWidget(html, "settings-access", "section");

  assert.doesNotMatch(card, /<input|<select|<textarea/);
  db.close();
});

test("the allow list count is stated plainly", async () => {
  const db = freshDb();
  const html = await settingsHtml(db);
  const card = dataWidget(html, "settings-access", "section");

  assert.match(card, /2 addresses/);
  db.close();
});
