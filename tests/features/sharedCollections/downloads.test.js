/**
 * Downloading from a shared collection
 */

"use strict";

const {
  PNG,
  withFiles,
  freshDb,
  models,
  anImage,
  at,
  startApp,
  shared,
} = require("./setup");

const test = require("node:test");
const assert = require("node:assert/strict");

test("one image downloads from a shared collection", async () => {
  const db = freshDb();
  const { id, token, ids } = shared(db);
  const cleanUp = withFiles(models(db).Collection.allImagesIn(id));

  const app = await startApp(db);
  try {
    const res = await fetch(`${app.base}/c/${token}/i/${ids[0]}/download`);

    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-disposition") || "", /attachment/);
    assert.equal((await res.bytes()).length, PNG.length, "the real bytes");
  } finally {
    app.stop();
    cleanUp();
    db.close();
  }
});

test("a download refuses an image from another collection", async () => {
  const db = freshDb();
  const { token } = shared(db);
  const outsider = anImage(db, "not yours");

  const app = await startApp(db);
  try {
    const res = await fetch(`${app.base}/c/${token}/i/${outsider}/download`);
    assert.equal(res.status, 404);
  } finally {
    app.stop();
    db.close();
  }
});

test("the zip serves the collection, and dies with the token", async () => {
  const db = freshDb();
  const { id, token } = shared(db, { images: ["one", "two"] });
  const cleanUp = withFiles(models(db).Collection.allImagesIn(id));

  const app = await startApp(db);
  try {
    const good = await fetch(`${app.base}/c/${token}/download`);
    assert.equal(good.status, 200);
    assert.equal(good.headers.get("content-type"), "application/zip");
    assert.match(good.headers.get("content-disposition") || "", /attachment/);
    const head = Buffer.from(await good.bytes())
      .subarray(0, 2)
      .toString();
    assert.equal(head, "PK");

    models(db).Collection.unshare(id);
    assert.equal((await fetch(`${app.base}/c/${token}/download`)).status, 404);
  } finally {
    app.stop();
    cleanUp();
    db.close();
  }
});

test("the zip holds the whole collection, not one page of it", () => {
  const db = freshDb();
  const { id } = shared(db, { images: ["one", "two", "three"] });
  models(db).Settings.update({ page_size: 1 });

  assert.equal(models(db).Collection.allImagesIn(id).length, 3);
  assert.equal(
    models(db).Collection.imagesPage(id, { limit: 1, offset: 0 }).length,
    1
  );
});

test("the grid and the image page offer their downloads", async () => {
  const db = freshDb();
  const { token, ids } = shared(db);

  const app = await startApp(db);
  try {
    const grid = await (await fetch(`${app.base}/c/${token}`)).text();
    assert.match(grid, new RegExp(`href="/c/${token}/download"`));

    const page = await (await fetch(`${app.base}/c/${token}/i/${ids[0]}`)).text();
    assert.match(page, new RegExp(`/c/${token}/i/${ids[0]}/download`));
  } finally {
    app.stop();
    db.close();
  }
});
