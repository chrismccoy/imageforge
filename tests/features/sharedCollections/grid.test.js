/**
 * A shared collection's grid
 */

"use strict";

const {
  NOW,
  freshDb,
  models,
  anImage,
  tokens,
  at,
  startApp,
  signIn,
  shared,
} = require("./setup");

const test = require("node:test");
const assert = require("node:assert/strict");

test("the grid shows the public title and never the private name", async () => {
  const db = freshDb();
  const { token } = shared(db, { images: ["a cat", "a dog"] });

  const app = await startApp(db);
  try {
    const res = await fetch(`${app.base}/c/${token}`);
    const html = await res.text();

    assert.equal(res.status, 200);
    assert.match(html, /Winter campaign/);
    assert.equal(/Acme Corp rebrand/.test(html), false, "the name must not leak");
    assert.equal(
      (html.match(/src="\/c\/[^"]+\/i\/\d+\.png"/g) || []).length,
      2,
      "one per image"
    );
    assert.match(html, /noindex/, "shared pages are not indexed");

    assert.equal(html.includes("a cat"), false, "no prompt on the tile");
    assert.equal(html.includes("a dog"), false, "no prompt on the tile");
    assert.equal(html.includes("gpt-image-2"), false, "no model on the tile");
  } finally {
    app.stop();
    db.close();
  }
});

test("an unknown, revoked, or malformed token is the same not-found", async () => {
  const db = freshDb();
  const { id, token } = shared(db);
  const app = await startApp(db);
  try {
    const good = await fetch(`${app.base}/c/${token}`);
    assert.equal(good.status, 200);

    models(db).Collection.unshare(id);

    const after = await fetch(`${app.base}/c/${token}`);
    const never = await fetch(`${app.base}/c/NEVEREXIST`);
    assert.equal(after.status, 404);
    assert.equal(never.status, 404);
    assert.equal(await after.text(), await never.text());

    assert.equal((await fetch(`${app.base}/c/%20`)).status, 404);
  } finally {
    app.stop();
    db.close();
  }
});

test("the grid pages, like the gallery", async () => {
  const db = freshDb();
  const { token } = shared(db, {
    images: ["one", "two", "three", "four", "five"],
  });
  models(db).Settings.update({ page_size: 2 });

  const app = await startApp(db);
  try {
    const first = await (await fetch(`${app.base}/c/${token}`)).text();
    assert.equal(
      (first.match(/src="\/c\/[^"]+\/i\/\d+\.png"/g) || []).length,
      2,
      "a page holds at most the page size"
    );
    assert.match(first, new RegExp(`/c/${token}/page/2`), "and offers the next");

    const second = await (await fetch(`${app.base}/c/${token}/page/2`)).text();
    assert.equal((second.match(/src="\/c\/[^"]+\/i\/\d+\.png"/g) || []).length, 2);
    assert.notEqual(first, second, "page two is not page one");

    const far = await fetch(`${app.base}/c/${token}/page/999`);
    assert.equal(far.status, 200);
    assert.match(await far.text(), /Winter campaign/);
  } finally {
    app.stop();
    db.close();
  }
});

test("an empty shared collection renders rather than erroring", async () => {
  const db = freshDb();
  const { token } = shared(db, { images: [] });
  const app = await startApp(db);
  try {
    const res = await fetch(`${app.base}/c/${token}`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /Winter campaign/);
    assert.match(html, /No images in this collection yet\./);
  } finally {
    app.stop();
    db.close();
  }
});

test("the file route serves only an image inside the collection", async () => {
  const db = freshDb();
  const { token } = shared(db);
  const outsider = anImage(db, "not yours");

  const app = await startApp(db);
  try {
    const stolen = await fetch(`${app.base}/c/${token}/i/${outsider}/file`);
    assert.equal(stolen.status, 404);

    const absent = await fetch(`${app.base}/c/${token}/i/999999/file`);
    assert.equal(absent.status, 404);
  } finally {
    app.stop();
    db.close();
  }
});

test("a shared collection is marked where images are filed", async () => {
  const db = freshDb();
  const { Collection } = models(db);
  anImage(db, "a cat");
  const open = Collection.add("Client work", NOW);
  const out = Collection.add("Acme Corp rebrand", NOW);
  Collection.share(out, "Winter campaign", tokens("SHAREDTOK1"));

  const app = await startApp(db);
  try {
    const { cookie } = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/generations`, { headers: { cookie } })
    ).text();

    assert.match(
      html,
      new RegExp(`<option value="${out}"[^>]*>[^<]*shared`, "i"),
      "the shared one is marked in the picker"
    );
    assert.doesNotMatch(
      html,
      new RegExp(`<option value="${open}"[^>]*>[^<]*shared`, "i"),
      "the private one is not"
    );
    assert.match(html, /Acme Corp rebrand/);
  } finally {
    app.stop();
    db.close();
  }
});

test("an image's page shows what made it, and links back", async () => {
  const db = freshDb();
  const { token, ids } = shared(db, { images: ["a golden sunset"] });

  const app = await startApp(db);
  try {
    const res = await fetch(`${app.base}/c/${token}/i/${ids[0]}`);
    const html = await res.text();

    assert.equal(res.status, 200);
    assert.match(html, /a golden sunset/);
    assert.match(html, /gpt-image-2/);
    assert.match(html, /1024x1024/);
    assert.match(html, new RegExp(`href="/c/${token}"`), "a way back to the grid");
    assert.equal(/Acme Corp rebrand/.test(html), false, "still no private name");
  } finally {
    app.stop();
    db.close();
  }
});

test("an image page refuses an image from another collection", async () => {
  const db = freshDb();
  const { token } = shared(db);
  const outsider = anImage(db, "not yours");
  const { Collection } = models(db);
  const other = Collection.add("Someone else", NOW);
  Collection.addImage(outsider, other);

  const app = await startApp(db);
  try {
    const res = await fetch(`${app.base}/c/${token}/i/${outsider}`);
    assert.equal(res.status, 404, "containment, not existence");
  } finally {
    app.stop();
    db.close();
  }
});
