/**
 * The Access card with an empty allow list
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";

const test = require("node:test");
const assert = require("node:assert/strict");

const { startApp, signIn, freshDb } = require("../helpers/app");
const { dataWidget } = require("../helpers/dom");

test("an empty allow list says what that means", async () => {
  const db = freshDb();
  const app = await startApp({ db });
  const cookie = await signIn(app.base);
  const html = await (
    await fetch(`${app.base}/settings`, { headers: { cookie } })
  ).text();
  app.stop();
  const card = dataWidget(html, "settings-access", "section");

  assert.match(card, /any address/);
  assert.doesNotMatch(card, /\d+ addresses/);
  db.close();
});
