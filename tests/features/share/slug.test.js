/**
 * Slugs in front of a token
 */

"use strict";

const {
  freshDb,
  addGeneration,
  startApp,
  signIn,
  useSharedApp,
} = require("./setup");

const test = require("node:test");
const assert = require("node:assert/strict");

const buildGeneration = require("../../../models/generation");
const buildSettings = require("../../../models/settings");
const path = require("path");

const shared = useSharedApp();

test("assigning a token redraws when the first one is taken", () => {
  const db = freshDb();
  const Generation = require("../../../models/generation")(db);

  const taken = Generation.add({ filename: "a.png", prompt: "", size: "" });
  Generation.setShareToken(taken, "duplicate");

  const target = Generation.add({ filename: "b.png", prompt: "", size: "" });

  const queue = ["duplicate", "fresh"];
  const token = Generation.share(target, () => queue.shift());

  assert.equal(token, "fresh");
  assert.equal(Generation.get(target).share_token, "fresh");
  assert.equal(Generation.get(taken).share_token, "duplicate");
  db.close();
});

test("assigning a token gives up rather than looping forever", () => {
  const db = freshDb();
  const Generation = require("../../../models/generation")(db);

  const taken = Generation.add({ filename: "a.png", prompt: "", size: "" });
  Generation.setShareToken(taken, "always");

  const target = Generation.add({ filename: "b.png", prompt: "", size: "" });

  assert.throws(() => Generation.share(target, () => "always"), /share token/i);
  db.close();
});

let plainToken;

test("a row with a realistic token is set up", () => {
  const Generation = buildGeneration(shared.db);
  const id = addGeneration(Generation, shared.file, "a shared cat");
  plainToken = "k3f9Qa72vX";
  Generation.setShareToken(id, plainToken);
  assert.equal(Generation.getByShareToken(plainToken).id, id);
});

test("a slugged URL resolves by the token at the end", async () => {
  const res = await fetch(`${shared.base}/s/a-shared-cat-${plainToken}`);
  assert.equal(res.status, 200);
});

test("a wrong slug in front of a good token still resolves", async () => {
  const res = await fetch(`${shared.base}/s/completely-unrelated-${plainToken}`);
  assert.equal(res.status, 200);
});

test("a good slug in front of a bad token is not found", async () => {
  const res = await fetch(`${shared.base}/s/a-shared-cat-nosuchtoken`);
  assert.equal(res.status, 404);
});

test("a bare token with no slug resolves", async () => {
  const res = await fetch(`${shared.base}/s/${plainToken}`);
  assert.equal(res.status, 200);
});

test("a legacy token containing a hyphen still resolves whole", async () => {
  const res = await fetch(`${shared.base}/s/tok-shared`);
  assert.equal(res.status, 200);
});

test("the image URL on the page matches the page's own URL", async () => {
  const html = await (
    await fetch(`${shared.base}/s/a-shared-cat-${plainToken}`)
  ).text();
  assert.match(html, new RegExp(`/i/${plainToken}`));
});

test("the share endpoint slugs the link when the setting is on", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const Settings = buildSettings(db);
  const id = addGeneration(Generation, shared.file, "A blue sky");
  Settings.update({ public_share: 1, public_share_slug: 1 });

  const app = await startApp({ db });
  try {
    const { cookie, csrf } = await signIn(app.base);
    const res = await fetch(`${app.base}/generations/${id}/share`, {
      method: "POST",
      headers: { cookie, "x-csrf-token": csrf },
    });
    const body = await res.json();
    const token = Generation.get(id).share_token;

    assert.equal(body.link, `/s/a-blue-sky-${token}`);
    assert.equal(body.image, `/i/a-blue-sky-${token}.png`);

    assert.equal((await fetch(`${app.base}${body.link}`)).status, 200);
    assert.equal((await fetch(`${app.base}/s/${token}`)).status, 200);
  } finally {
    app.stop();
    db.close();
  }
});

test("turning the setting off changes existing links without touching the row", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const Settings = buildSettings(db);
  const id = addGeneration(Generation, shared.file, "A blue sky");
  Settings.update({ public_share: 1, public_share_slug: 1 });

  const app = await startApp({ db });
  try {
    const { cookie, csrf } = await signIn(app.base);
    const share = () =>
      fetch(`${app.base}/generations/${id}/share`, {
        method: "POST",
        headers: { cookie, "x-csrf-token": csrf },
      }).then((r) => r.json());

    const slugged = await share();
    const token = Generation.get(id).share_token;

    Settings.update({ public_share_slug: 0 });
    const plain = await share();

    assert.equal(slugged.link, `/s/a-blue-sky-${token}`);
    assert.equal(plain.link, `/s/${token}`);
    assert.equal(Generation.get(id).share_token, token);
    assert.equal((await fetch(`${app.base}${slugged.link}`)).status, 200);
    assert.equal((await fetch(`${app.base}${plain.link}`)).status, 200);
  } finally {
    app.stop();
    db.close();
  }
});
