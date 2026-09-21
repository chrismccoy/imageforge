/**
 * The favourites download
 */

"use strict";

const {
  withFiles,
  freshDb,
  models,
  anImage,
  startApp,
  shared,
} = require("./setup");

const test = require("node:test");
const assert = require("node:assert/strict");

const { isoDate } = require("../../../utils/domain/format");

test("the favourites zip holds every starred image, not one page of it", async () => {
  const db = freshDb();
  const { Settings } = models(db);
  const { ids, token } = shared(db, [
    "zip cat one",
    "zip cat two",
    "zip cat three",
  ]);
  const cleanUp = withFiles(db, ids);
  Settings.update({ page_size: 1 });

  const app = await startApp(db);
  try {
    const res = await fetch(`${app.base}/f/${token}/download`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/zip");
    assert.match(res.headers.get("content-disposition") || "", /attachment/);

    const bytes = Buffer.from(await res.bytes()).toString("latin1");
    assert.equal(bytes.slice(0, 2), "PK");

    ids.forEach((id) => {
      const filename = models(db).Generation.get(id).filename;
      assert.ok(bytes.includes(filename), `${filename} missing from the zip`);
    });
  } finally {
    cleanUp();
    app.stop();
    db.close();
  }
});

test("an unstarred image is not in the favourites zip", async () => {
  const db = freshDb();
  const { ids, token } = shared(db, ["zip cat starred"]);
  const notStarred = anImage(db, "zip cat unstarred");
  const cleanUp = withFiles(db, [...ids, notStarred]);

  const app = await startApp(db);
  try {
    const res = await fetch(`${app.base}/f/${token}/download`);
    const bytes = Buffer.from(await res.bytes()).toString("latin1");

    const starredFilename = models(db).Generation.get(ids[0]).filename;
    const unstarredFilename = models(db).Generation.get(notStarred).filename;
    assert.ok(bytes.includes(starredFilename));
    assert.equal(bytes.includes(unstarredFilename), false);
  } finally {
    cleanUp();
    app.stop();
    db.close();
  }
});

test("a revoked or wrong token 404s on the favourites zip, exactly as the page does", async () => {
  const db = freshDb();
  const { Settings } = models(db);
  const { ids, token } = shared(db, ["zip cat revoke test"]);
  const cleanUp = withFiles(db, ids);

  const app = await startApp(db);
  try {
    assert.equal((await fetch(`${app.base}/f/NEVEREXIST/download`)).status, 404);

    const good = await fetch(`${app.base}/f/${token}/download`);
    assert.equal(good.status, 200);

    Settings.unshareFavourites();
    assert.equal((await fetch(`${app.base}/f/${token}/download`)).status, 404);
  } finally {
    cleanUp();
    app.stop();
    db.close();
  }
});

test("the favourites zip is named favourites-<date>.zip", async () => {
  const db = freshDb();
  const { ids, token } = shared(db, ["zip cat filename test"]);
  const cleanUp = withFiles(db, ids);

  const app = await startApp(db);
  try {
    const res = await fetch(`${app.base}/f/${token}/download`);
    assert.equal(
      res.headers.get("content-disposition"),
      `attachment; filename="favourites-${isoDate()}.zip"`
    );
  } finally {
    cleanUp();
    app.stop();
    db.close();
  }
});

test("a starred image whose file is missing is skipped, not fatal, in the zip", async () => {
  const db = freshDb();
  const { ids, token } = shared(db, ["zip cat present", "zip cat missing"]);
  const cleanUp = withFiles(db, [ids[0]]);

  const app = await startApp(db);
  try {
    const res = await fetch(`${app.base}/f/${token}/download`);
    assert.equal(res.status, 200);

    const bytes = Buffer.from(await res.bytes()).toString("latin1");
    const presentFilename = models(db).Generation.get(ids[0]).filename;
    const missingFilename = models(db).Generation.get(ids[1]).filename;
    assert.ok(bytes.includes(presentFilename));
    assert.equal(bytes.includes(missingFilename), false);
  } finally {
    cleanUp();
    app.stop();
    db.close();
  }
});

test("the download-all button is absent with nothing starred, present with something starred", async () => {
  const db = freshDb();
  const { Settings } = models(db);
  Settings.update({ public_favourites: 1 });
  const token = Settings.shareFavourites(() => "FAVBUTTON1");

  const app = await startApp(db);
  try {
    const empty = await (await fetch(`${app.base}/f/${token}`)).text();
    assert.equal(empty.includes(`/f/${token}/download`), false);

    models(db).Generation.toggleFavorite(anImage(db, "a button test cat"));
    const withOne = await (await fetch(`${app.base}/f/${token}`)).text();
    assert.match(withOne, new RegExp(`href="/f/${token}/download"`));
    assert.match(withOne, /Download all/);
  } finally {
    app.stop();
    db.close();
  }
});
