/**
 * Multipart CSRF regression tests
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";
process.env.PUBLIC_SHARE = "";
process.env.PUBLIC_GALLERY = "";

const test = require("node:test");
const assert = require("node:assert/strict");

const { freshDb, startApp, signIn, csrfFor } = require("../../helpers/app");
const { quietLog } = require("../../helpers/quietLog");

async function withApp(run) {
  const db = freshDb();
  const app = await startApp({ db, log: quietLog() });
  try {
    const cookie = await signIn(app.base);
    const token = await csrfFor(app.base, cookie);
    await run({ base: app.base, cookie, token });
  } finally {
    app.stop();
    db.close();
  }
}

function multipart(fields = {}) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  return form;
}

test("a multipart POST without a token is refused on routes with no parser", async () => {
  await withApp(async ({ base, cookie }) => {
    for (const path of [
      "/trash/1/purge",
      "/settings/favourites/share",
      "/Settings/Favourites/Share/",
      "/logout",
    ]) {
      const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: { cookie },
        body: multipart({ x: "1" }),
        redirect: "manual",
      });
      assert.equal(res.status, 403, `${path} must need the token`);
    }
  });
});

test("a multipart POST with the token header still reaches a route with no parser", async () => {
  await withApp(async ({ base, cookie, token }) => {
    const res = await fetch(`${base}/settings/favourites/share`, {
      method: "POST",
      headers: { cookie, "x-csrf-token": token },
      body: multipart({ x: "1" }),
      redirect: "manual",
    });
    assert.notEqual(res.status, 403);
  });
});

// The file is not an image, so nothing is written to the uploads folder.
test("upload routes still read the token from the multipart body", async () => {
  await withApp(async ({ base, cookie, token }) => {
    const withToken = multipart({ _csrf: token });
    withToken.append(
      "image",
      new Blob(["not an image"], { type: "image/png" }),
      "a.png"
    );
    const ok = await fetch(`${base}/upload`, {
      method: "POST",
      headers: { cookie },
      body: withToken,
      redirect: "manual",
    });
    assert.notEqual(ok.status, 403, "the body token is accepted after parsing");

    const without = multipart();
    without.append(
      "image",
      new Blob(["not an image"], { type: "image/png" }),
      "a.png"
    );
    const refused = await fetch(`${base}/upload`, {
      method: "POST",
      headers: { cookie },
      body: without,
      redirect: "manual",
    });
    assert.equal(refused.status, 403, "and still refused without one");

    const imported = await fetch(`${base}/prompts/import`, {
      method: "POST",
      headers: { cookie },
      body: multipart({ _csrf: token }),
      redirect: "manual",
    });
    assert.notEqual(imported.status, 403);
  });
});
