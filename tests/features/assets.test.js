/**
 * Vendored asset tests
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

test("the icon stylesheet is served by this app", async () => {
  const app = await startApp({ db: freshDb() });
  try {
    const res = await fetch(`${app.base}/vendor/fontawesome/css/all.min.css`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") || "", /text\/css/);
  } finally {
    app.stop();
  }
});

test("the two faces the app draws with are on disk", async () => {
  const app = await startApp({ db: freshDb() });
  try {
    for (const face of ["fa-solid-900", "fa-regular-400"]) {
      const res = await fetch(
        `${app.base}/vendor/fontawesome/webfonts/${face}.woff2`
      );
      assert.equal(res.status, 200, `${face} is missing`);
    }
  } finally {
    app.stop();
  }
});

test("a page asks no other host for its styling", async () => {
  const app = await startApp({ db: freshDb() });
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/`, { headers: { cookie } })
    ).text();

    assert.match(html, /href="\/vendor\/fontawesome\/css\/all\.min\.css"/);
    assert.doesNotMatch(html, /https?:\/\/(cdnjs|cdn|fonts|use)\./);
  } finally {
    app.stop();
  }
});
