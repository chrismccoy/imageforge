/**
 * Link preview tests
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";

const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");

const schema = require("../../db/schema");
const { createApp } = require("../../server");
const { originOf, absoluteUrl } = require("../../utils/http/origin");

test("the origin is the scheme and host the request arrived on", () => {
  const req = {
    protocol: "https",
    get: (name) => (name === "host" ? "img.example" : ""),
  };
  assert.equal(originOf(req), "https://img.example");
});

test("the scheme comes from the request rather than being assumed", () => {
  const req = { protocol: "http", get: () => "localhost:3000" };
  assert.equal(originOf(req), "http://localhost:3000");
});

test("a request with no host has no origin", () => {
  assert.equal(originOf({ protocol: "https", get: () => undefined }), "");
  assert.equal(originOf(null), "");
});

test("a path becomes absolute against the request's origin", () => {
  const req = { protocol: "https", get: () => "img.example" };
  assert.equal(absoluteUrl(req, "/i/tok.png"), "https://img.example/i/tok.png");
  assert.equal(absoluteUrl({ get: () => "" }, "/i/tok.png"), "");
});

function freshDb() {
  const db = new Database(":memory:");
  schema.init(db);
  return db;
}

function models(db) {
  return require("../../models").buildModels(db);
}

function anImage(db, prompt) {
  return Number(
    models(db).Generation.add({
      filename: `${process.pid}-og-${prompt.replace(/\s/g, "-")}.png`,
      prompt,
      model: "gpt-image-2",
      size: "1024x1024",
    })
  );
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

function meta(html, key) {
  const found = new RegExp(
    `<meta (?:property|name)="${key}" content="([^"]*)"`
  ).exec(html);
  return found ? found[1] : null;
}

test("a shared image's page carries a card pointing at the picture", async () => {
  const db = freshDb();
  const { Generation, Settings } = models(db);
  Settings.update({ public_share: 1 });
  const id = anImage(db, "a shared cat");
  Generation.setShareToken(id, "OGTOKEN001");

  const app = await startApp(db);
  try {
    const res = await fetch(`${app.base}/s/OGTOKEN001`);
    const html = await res.text();

    assert.equal(res.status, 200);
    assert.equal(meta(html, "og:title"), "a shared cat");
    assert.equal(
      meta(html, "og:image"),
      `${app.base}/i/OGTOKEN001.png`,
      "absolute, and the extension form"
    );
    assert.equal(meta(html, "og:url"), `${app.base}/s/OGTOKEN001`);
    assert.equal(meta(html, "twitter:card"), "summary_large_image");
  } finally {
    app.stop();
    db.close();
  }
});

test("a page with a card is still not indexed", async () => {
  const db = freshDb();
  const { Generation, Settings } = models(db);
  Settings.update({ public_share: 1 });
  const id = anImage(db, "a quiet cat");
  Generation.setShareToken(id, "OGTOKEN002");

  const app = await startApp(db);
  try {
    const res = await fetch(`${app.base}/s/OGTOKEN002`);
    const html = await res.text();

    assert.equal(res.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.match(html, /name="robots" content="noindex, nofollow"/);
    assert.ok(meta(html, "og:image"), "and it still previews");
  } finally {
    app.stop();
    db.close();
  }
});

test("a shared collection's card shows the public title", async () => {
  const db = freshDb();
  const { Collection, Settings } = models(db);
  Settings.update({ public_collections: 1 });

  const collectionId = Collection.add(
    "Acme Corp rebrand",
    "2026-08-10T10:00:00.000Z"
  );
  const imageId = anImage(db, "a winter cat");
  Collection.addImage(imageId, collectionId);
  const token = Collection.share(
    collectionId,
    "Winter campaign",
    () => "OGCOLTOK01"
  );

  const app = await startApp(db);
  try {
    const html = await (await fetch(`${app.base}/c/${token}`)).text();

    assert.equal(meta(html, "og:title"), "Winter campaign");
    assert.equal(meta(html, "og:image"), `${app.base}/c/${token}/i/${imageId}.png`);
    assert.equal(
      html.includes("Acme Corp rebrand"),
      false,
      "the private name must not leak into the card"
    );
  } finally {
    app.stop();
    db.close();
  }
});

test("a collection with nothing in it previews without a picture", async () => {
  const db = freshDb();
  const { Collection, Settings } = models(db);
  Settings.update({ public_collections: 1 });

  const collectionId = Collection.add("Empty", "2026-08-10T10:00:00.000Z");
  const token = Collection.share(collectionId, "Nothing yet", () => "OGCOLTOK02");

  const app = await startApp(db);
  try {
    const html = await (await fetch(`${app.base}/c/${token}`)).text();

    assert.equal(meta(html, "og:title"), "Nothing yet");
    assert.equal(meta(html, "og:image"), null);
  } finally {
    app.stop();
    db.close();
  }
});

test("the favourites link previews with a starred image", async () => {
  const db = freshDb();
  const { Generation, Settings } = models(db);
  const id = anImage(db, "a starred cat");
  Generation.toggleFavorite(id);
  Settings.update({ public_favourites: 1 });
  const token = Settings.shareFavourites(() => "OGFAVTOK01");

  const app = await startApp(db);
  try {
    const html = await (await fetch(`${app.base}/f/${token}`)).text();

    assert.equal(meta(html, "og:title"), "Favourites");
    assert.equal(meta(html, "og:image"), `${app.base}/f/${token}/i/${id}.png`);
  } finally {
    app.stop();
    db.close();
  }
});

test("one image's page inside a collection previews with that image", async () => {
  const db = freshDb();
  const { Collection, Settings } = models(db);
  Settings.update({ public_collections: 1 });

  const collectionId = Collection.add("Acme", "2026-08-10T10:00:00.000Z");
  const imageId = anImage(db, "a golden sunset");
  Collection.addImage(imageId, collectionId);
  const token = Collection.share(
    collectionId,
    "Winter campaign",
    () => "OGCOLTOK03"
  );

  const app = await startApp(db);
  try {
    const html = await (await fetch(`${app.base}/c/${token}/i/${imageId}`)).text();

    assert.equal(meta(html, "og:title"), "a golden sunset");
    assert.equal(meta(html, "og:image"), `${app.base}/c/${token}/i/${imageId}.png`);
  } finally {
    app.stop();
    db.close();
  }
});

test("the pages behind the login carry no card", async () => {
  const db = freshDb();
  const app = await startApp(db);
  try {
    const html = await (await fetch(`${app.base}/login`)).text();
    assert.equal(meta(html, "og:image"), null);
    assert.equal(meta(html, "og:title"), null);
  } finally {
    app.stop();
    db.close();
  }
});
