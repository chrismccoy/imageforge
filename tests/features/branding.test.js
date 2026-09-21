/**
 * White labelling
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";
process.env.BRAND_NAME = "";
process.env.BRAND_ICON = "";

const test = require("node:test");
const assert = require("node:assert/strict");

const { startApp, freshDb, signIn, csrfFor } = require("../helpers/app");
const { buildModels } = require("../../models");

const TOKEN = "BRANDTOKEN1";

function sharedImage(db) {
  const { Generation, Settings } = buildModels(db);
  Settings.update({ public_share: 1 });
  const id = Number(
    Generation.add({
      filename: `${process.pid}-brand.png`,
      prompt: "a shared lighthouse",
      model: "gpt-image-2",
      size: "1024x1024",
    })
  );
  Generation.setShareToken(id, TOKEN);
}

function saveSettings(base, cookie, csrf, fields) {
  const body = new URLSearchParams(
    Object.assign(
      {
        _csrf: csrf,
        default_size: "1024x1024",
        model: "1.5",
        public_share: "on",
      },
      fields
    )
  );
  return fetch(`${base}/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie },
    body: body.toString(),
  });
}

function meta(html, key) {
  const found = new RegExp(
    `<meta (?:property|name)="${key}" content="([^"]*)"`
  ).exec(html);
  return found ? found[1] : null;
}

function title(html) {
  const found = /<title>([^<]*)<\/title>/.exec(html);
  return found ? found[1] : null;
}

test("an install that has set no brand looks unchanged", async () => {
  const db = freshDb();
  sharedImage(db);
  const app = await startApp({ db });

  try {
    const shared = await (await fetch(`${app.base}/s/${TOKEN}`)).text();
    assert.equal(meta(shared, "og:site_name"), "Image Forge");
    assert.match(shared, /Made with Image Forge/);
    assert.match(shared, /fa-solid fa-bolt/);

    const login = await (await fetch(`${app.base}/login`)).text();
    assert.match(login, /Image Forge/);
    assert.equal(title(login), "Log in · Image Forge");
  } finally {
    app.stop();
    db.close();
  }
});

test("a saved name and mark reach every page", async () => {
  const db = freshDb();
  sharedImage(db);
  const app = await startApp({ db });

  try {
    const cookie = await signIn(app.base);
    const csrf = await csrfFor(app.base, cookie, "/settings");

    const saved = await saveSettings(app.base, cookie, csrf, {
      brand_name: "Pixel Barn",
      brand_icon: "fa-solid fa-camera",
      brand_mark: "on",
    });

    const html = await saved.text();
    assert.equal(title(html), "Settings · Pixel Barn");
    assert.match(html, /Pixel Barn/);
    assert.match(html, /fa-solid fa-camera/);

    const shared = await (await fetch(`${app.base}/s/${TOKEN}`)).text();
    assert.equal(meta(shared, "og:site_name"), "Pixel Barn");
    assert.match(shared, /Made with Pixel Barn/);
    assert.match(shared, /fa-solid fa-camera/);
    assert.doesNotMatch(shared, /Image Forge/);

    const login = await (await fetch(`${app.base}/login`)).text();
    assert.equal(title(login), "Log in · Pixel Barn");
    assert.match(login, /fa-solid fa-camera/);
    assert.doesNotMatch(login, /Image Forge/);
  } finally {
    app.stop();
    db.close();
  }
});

test("the footer credit can be switched off", async () => {
  const db = freshDb();
  sharedImage(db);
  const app = await startApp({ db });

  try {
    const cookie = await signIn(app.base);
    const csrf = await csrfFor(app.base, cookie, "/settings");

    await saveSettings(app.base, cookie, csrf, {
      brand_name: "Pixel Barn",
      brand_mark: "on",
    });
    const on = await (await fetch(`${app.base}/s/${TOKEN}`)).text();
    assert.match(on, /Made with Pixel Barn/);

    await saveSettings(app.base, cookie, csrf, { brand_name: "Pixel Barn" });
    const off = await (await fetch(`${app.base}/s/${TOKEN}`)).text();
    assert.doesNotMatch(off, /Made with/);

    assert.equal((off.match(/<main/g) || []).length, 1);
    assert.equal((off.match(/<\/main>/g) || []).length, 1);
  } finally {
    app.stop();
    db.close();
  }
});

test("a mistyped icon leaves the mark as it was", async () => {
  const db = freshDb();
  const app = await startApp({ db });

  try {
    const cookie = await signIn(app.base);
    const csrf = await csrfFor(app.base, cookie, "/settings");

    await saveSettings(app.base, cookie, csrf, { brand_icon: "camrea" });

    const login = await (await fetch(`${app.base}/login`)).text();
    assert.match(login, /fa-solid fa-bolt/);
  } finally {
    app.stop();
    db.close();
  }
});

test("the error page a bad request lands on still carries the brand", async () => {
  const db = freshDb();
  const app = await startApp({ db });

  try {
    const cookie = await signIn(app.base);
    const csrf = await csrfFor(app.base, cookie, "/settings");
    await saveSettings(app.base, cookie, csrf, { brand_name: "Pixel Barn" });

    const res = await fetch(`${app.base}/settings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/html",
        cookie,
      },
      body: "{ not json",
    });
    const html = await res.text();

    assert.equal(res.status, 400);
    assert.match(html, /Pixel Barn/, "the error page wears the brand too");
  } finally {
    app.stop();
    db.close();
  }
});
