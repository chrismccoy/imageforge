/**
 * Stepping through favourites
 */

"use strict";

const { freshDb, models, anImage, startApp, shared, at } = require("./setup");

const test = require("node:test");
const assert = require("node:assert/strict");

test("stepping through favourites lands on the right image, disabled at both ends", async () => {
  const db = freshDb();
  const { ids, token } = shared(db, ["first", "second", "third"]);
  at(db, ids[0], "2026-08-10T10:00:00.000Z");
  at(db, ids[1], "2026-08-10T10:00:01.000Z");
  at(db, ids[2], "2026-08-10T10:00:02.000Z");

  const app = await startApp(db);
  try {
    const middle = await (await fetch(`${app.base}/f/${token}/i/${ids[1]}`)).text();
    const prevTag = /<a\b[^>]*\bdata-neighbour-prev\b[^>]*>/.exec(middle)?.[0];
    const nextTag = /<a\b[^>]*\bdata-neighbour-next\b[^>]*>/.exec(middle)?.[0];
    assert.ok(prevTag, "middle image has a previous");
    assert.ok(nextTag, "middle image has a next");
    assert.match(prevTag, new RegExp(`href="/f/${token}/i/${ids[2]}"`));
    assert.match(nextTag, new RegExp(`href="/f/${token}/i/${ids[0]}"`));

    const newest = await (await fetch(`${app.base}/f/${token}/i/${ids[2]}`)).text();
    assert.equal(
      /<a\b[^>]*\bdata-neighbour-prev\b/.test(newest),
      false,
      "no previous past the newest, not a wrap to the oldest"
    );
    assert.match(newest, /<span\b[^>]*\bdata-neighbour-prev\b/);

    const oldest = await (await fetch(`${app.base}/f/${token}/i/${ids[0]}`)).text();
    assert.equal(
      /<a\b[^>]*\bdata-neighbour-next\b/.test(oldest),
      false,
      "no next past the oldest, not a wrap to the newest"
    );
    assert.match(oldest, /<span\b[^>]*\bdata-neighbour-next\b/);
  } finally {
    app.stop();
    db.close();
  }
});

test("two starred images sharing a created_at are still ordered and stepped correctly", async () => {
  const db = freshDb();
  const { ids, token } = shared(db, ["alpha", "beta", "gamma"]);
  at(db, ids[0], "2026-08-10T10:00:02.000Z");
  at(db, ids[1], "2026-08-10T10:00:00.000Z");
  at(db, ids[2], "2026-08-10T10:00:00.000Z");

  const app = await startApp(db);
  try {
    const html = await (await fetch(`${app.base}/f/${token}/i/${ids[2]}`)).text();
    const prevTag = /<a\b[^>]*\bdata-neighbour-prev\b[^>]*>/.exec(html)?.[0];
    const nextTag = /<a\b[^>]*\bdata-neighbour-next\b[^>]*>/.exec(html)?.[0];
    assert.match(prevTag, new RegExp(`href="/f/${token}/i/${ids[0]}"`));
    assert.match(nextTag, new RegExp(`href="/f/${token}/i/${ids[1]}"`));
  } finally {
    app.stop();
    db.close();
  }
});

test("a trashed-but-starred image is never offered as a favourites neighbour", async () => {
  const db = freshDb();
  const { Generation } = models(db);
  const { ids, token } = shared(db, ["kept one", "to trash", "kept two"]);
  at(db, ids[0], "2026-08-10T10:00:00.000Z");
  at(db, ids[1], "2026-08-10T10:00:01.000Z");
  at(db, ids[2], "2026-08-10T10:00:02.000Z");
  Generation.trash(ids[1]);

  const app = await startApp(db);
  try {
    const html = await (await fetch(`${app.base}/f/${token}/i/${ids[2]}`)).text();
    const nextTag = /<a\b[^>]*\bdata-neighbour-next\b[^>]*>/.exec(html)?.[0];
    assert.ok(nextTag);
    assert.match(
      nextTag,
      new RegExp(`href="/f/${token}/i/${ids[0]}"`),
      "the trashed image is skipped"
    );
    assert.equal(html.includes(`/i/${ids[1]}`), false);
  } finally {
    app.stop();
    db.close();
  }
});

test("an unstarred image is never reachable as a favourites neighbour", async () => {
  const db = freshDb();
  const { ids, token } = shared(db, ["one", "two"]);
  const notStarred = anImage(db, "not starred");
  at(db, ids[0], "2026-08-10T10:00:00.000Z");
  at(db, notStarred, "2026-08-10T10:00:01.000Z");
  at(db, ids[1], "2026-08-10T10:00:02.000Z");

  const app = await startApp(db);
  try {
    const html = await (await fetch(`${app.base}/f/${token}/i/${ids[1]}`)).text();
    const nextTag = /<a\b[^>]*\bdata-neighbour-next\b[^>]*>/.exec(html)?.[0];
    assert.ok(nextTag);
    assert.match(nextTag, new RegExp(`href="/f/${token}/i/${ids[0]}"`));
    assert.equal(html.includes(`/i/${notStarred}`), false);
  } finally {
    app.stop();
    db.close();
  }
});

test("a revoked token 404s a favourite's neighbour URLs exactly as it 404s the page", async () => {
  const db = freshDb();
  const { Settings } = models(db);
  const { ids, token } = shared(db, ["one", "two"]);
  at(db, ids[0], "2026-08-10T10:00:00.000Z");
  at(db, ids[1], "2026-08-10T10:00:01.000Z");

  const app = await startApp(db);
  try {
    const html = await (await fetch(`${app.base}/f/${token}/i/${ids[0]}`)).text();
    const prevTag = /<a\b[^>]*\bdata-neighbour-prev\b[^>]*>/.exec(html)?.[0];
    const prevHref = prevTag && /href="([^"]+)"/.exec(prevTag)?.[1];
    assert.ok(prevHref, "no previous link found to revoke against");

    Settings.unshareFavourites();
    assert.equal((await fetch(`${app.base}${prevHref}`)).status, 404);
    assert.equal((await fetch(`${app.base}/f/${token}/i/${ids[0]}`)).status, 404);
  } finally {
    app.stop();
    db.close();
  }
});

test("a favourite's neighbour links leak nothing about the neighbour beyond its id", async () => {
  const db = freshDb();
  const { ids, token } = shared(db, [
    "a secret prompt only the neighbour should carry",
    "the one you are looking at",
  ]);
  at(db, ids[0], "2026-08-10T10:00:00.000Z");
  at(db, ids[1], "2026-08-10T10:00:01.000Z");

  const app = await startApp(db);
  try {
    const html = await (await fetch(`${app.base}/f/${token}/i/${ids[1]}`)).text();
    assert.equal(
      html.includes("a secret prompt only the neighbour should carry"),
      false
    );
  } finally {
    app.stop();
    db.close();
  }
});

test("a lone favourite gets no stepping controls at all", async () => {
  const db = freshDb();
  const { ids, token } = shared(db, ["the only starred one"]);

  const app = await startApp(db);
  try {
    const html = await (await fetch(`${app.base}/f/${token}/i/${ids[0]}`)).text();

    assert.equal(
      /data-neighbour-prev/.test(html),
      false,
      "no previous control, not even a disabled one"
    );
    assert.equal(
      /data-neighbour-next/.test(html),
      false,
      "no next control, not even a disabled one"
    );
    assert.match(html, /Back to Favourites/);
  } finally {
    app.stop();
    db.close();
  }
});

test("a second favourite brings the stepping controls back", async () => {
  const db = freshDb();
  const { ids, token } = shared(db, ["first", "second"]);
  at(db, ids[0], "2026-08-10T10:00:00.000Z");
  at(db, ids[1], "2026-08-10T10:00:01.000Z");

  const app = await startApp(db);
  try {
    const html = await (await fetch(`${app.base}/f/${token}/i/${ids[0]}`)).text();
    assert.match(html, /<a\b[^>]*\bdata-neighbour-prev\b/);
    assert.match(html, /<span\b[^>]*\bdata-neighbour-next\b/);
  } finally {
    app.stop();
    db.close();
  }
});
