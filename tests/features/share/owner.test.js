/**
 * Sharing from the generations page
 */

"use strict";

const {
  freshDb,
  addGeneration,
  startApp,
  signIn,
  useFixtureFile,
} = require("./setup");

const test = require("node:test");
const assert = require("node:assert/strict");

const buildGeneration = require("../../../models/generation");
const buildSettings = require("../../../models/settings");
const path = require("path");

const fixture = useFixtureFile();

test("sharing a generation mints a token and returns both urls", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const id = addGeneration(Generation, fixture.name, "mintable");
  const app = await startApp({ db });
  try {
    const { cookie, csrf } = await signIn(app.base);
    const res = await fetch(`${app.base}/generations/${id}/share`, {
      method: "POST",
      headers: { cookie, "x-csrf-token": csrf },
    });
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.match(body.link, /^\/s\/[0-9A-Za-z]{10}$/);
    assert.equal(body.image, `${body.link.replace("/s/", "/i/")}.png`);

    const token = Generation.get(id).share_token;
    assert.equal(body.link, `/s/${token}`);
    const page = await fetch(`${app.base}${body.link}`);
    assert.equal(page.status, 200);
  } finally {
    app.stop();
    db.close();
  }
});

test("sharing twice returns the same token", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const id = addGeneration(Generation, fixture.name, "mint once");
  const app = await startApp({ db });
  try {
    const { cookie, csrf } = await signIn(app.base);
    const headers = { cookie, "x-csrf-token": csrf };
    const first = await (
      await fetch(`${app.base}/generations/${id}/share`, {
        method: "POST",
        headers,
      })
    ).json();
    const second = await (
      await fetch(`${app.base}/generations/${id}/share`, {
        method: "POST",
        headers,
      })
    ).json();
    assert.equal(first.link, second.link);
  } finally {
    app.stop();
    db.close();
  }
});

test("sharing an unknown id is a 404", async () => {
  const db = freshDb();
  const app = await startApp({ db });
  try {
    const { cookie, csrf } = await signIn(app.base);
    const res = await fetch(`${app.base}/generations/9999/share`, {
      method: "POST",
      headers: { cookie, "x-csrf-token": csrf },
    });
    assert.equal(res.status, 404);
  } finally {
    app.stop();
    db.close();
  }
});

test("unsharing clears the token and dead-links the page", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const id = addGeneration(Generation, fixture.name, "revocable");
  Generation.setShareToken(id, "tok-revocable");
  const app = await startApp({ db });
  try {
    const { cookie, csrf } = await signIn(app.base);
    const res = await fetch(`${app.base}/generations/${id}/unshare`, {
      method: "POST",
      headers: {
        cookie,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `_csrf=${csrf}`,
      redirect: "manual",
    });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/generations");
    assert.equal(Generation.get(id).share_token, null);

    const dead = await fetch(`${app.base}/s/tok-revocable`);
    assert.equal(dead.status, 404);
  } finally {
    app.stop();
    db.close();
  }
});

test("an anonymous visitor cannot mint a share token", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const id = addGeneration(Generation, fixture.name, "not yours");
  const app = await startApp({ db });
  try {
    const res = await fetch(`${app.base}/generations/${id}/share`, {
      method: "POST",
      redirect: "manual",
    });
    assert.notEqual(res.status, 200);
    assert.equal(Generation.get(id).share_token, null);
  } finally {
    app.stop();
    db.close();
  }
});

test("the generations page offers share buttons and marks shared rows", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const plain = addGeneration(Generation, fixture.name, "not shared yet");
  const shared = addGeneration(Generation, fixture.name, "already shared");
  Generation.setShareToken(shared, "tok-listed");
  buildSettings(db).update({ public_share: 1 });

  const app = await startApp({ db });
  try {
    const { cookie } = await signIn(app.base);
    const res = await fetch(`${app.base}/generations`, { headers: { cookie } });
    assert.equal(res.status, 200);
    const html = await res.text();

    assert.equal((html.match(/data-share="link"/g) || []).length, 2);
    assert.equal((html.match(/data-share="image"/g) || []).length, 2);
    assert.match(html, new RegExp(`data-gen-id="${plain}"`));

    assert.match(html, /data-share-url="\/s\/tok-listed"/);
    assert.match(html, new RegExp(`/generations/${shared}/unshare`));
    assert.match(html, /Shared/);

    assert.match(html, new RegExp(`/generations/${plain}/unshare`));
    assert.equal((html.match(/data-share-unshare/g) || []).length, 2);
    assert.equal((html.match(/data-share-unshare[^>]*hidden/g) || []).length, 1);
    assert.equal((html.match(/data-share-badge[^>]*hidden/g) || []).length, 1);

    assert.equal((html.match(/data-share-row/g) || []).length, 2);

    assert.match(html, /id="share-dialog"/);
    assert.match(html, /\/js\/share\.js/);
  } finally {
    app.stop();
    db.close();
  }
});

test("with sharing off the card has no share controls", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  addGeneration(Generation, fixture.name, "already shared");
  Generation.setShareToken(Generation.all()[0].id, "tok-hidden-ui");
  buildSettings(db).update({ public_share: 0 });

  const app = await startApp({ db });
  try {
    const cookie = (await signIn(app.base)).cookie;
    const html = await (
      await fetch(`${app.base}/generations`, { headers: { cookie } })
    ).text();

    assert.equal(html.includes("data-share-row"), false);
    assert.equal(html.includes("Share Link"), false);
    assert.equal(html.includes("/unshare"), false);

    assert.match(html, /Show Prompt/);
    assert.match(html, /Delete/);
  } finally {
    app.stop();
    db.close();
  }
});

test("the share strip sits above the image and states the share status", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  addGeneration(Generation, fixture.name, "unshared one");
  buildSettings(db).update({ public_share: 1 });

  const app = await startApp({ db });
  try {
    const cookie = (await signIn(app.base)).cookie;
    const html = await (
      await fetch(`${app.base}/generations`, { headers: { cookie } })
    ).text();

    assert.ok(
      html.indexOf("data-share-row") < html.indexOf("/uploads/"),
      "the share strip should render above the image"
    );

    assert.match(html, /data-share-none/);
    assert.equal((html.match(/data-share-badge[^>]*hidden/g) || []).length, 1);
    assert.equal((html.match(/data-share-unshare[^>]*hidden/g) || []).length, 1);
    assert.equal((html.match(/data-share-none[^>]*hidden/g) || []).length, 0);

    assert.match(html, /Show Prompt/);
    assert.match(html, /Download/);
    assert.match(html, /Delete/);
  } finally {
    app.stop();
    db.close();
  }
});
