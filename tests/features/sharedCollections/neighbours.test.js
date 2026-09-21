/**
 * Stepping through a shared collection
 */

"use strict";

const { NOW, freshDb, models, anImage, at, startApp, shared } = require("./setup");

const test = require("node:test");
const assert = require("node:assert/strict");

test("stepping through a shared collection's images lands on the right one, disabled at both ends", async () => {
  const db = freshDb();
  const { token, ids } = shared(db, { images: ["first", "second", "third"] });
  at(db, ids[0], "2026-08-10T10:00:00.000Z");
  at(db, ids[1], "2026-08-10T10:00:01.000Z");
  at(db, ids[2], "2026-08-10T10:00:02.000Z");

  const app = await startApp(db);
  try {
    const middle = await (await fetch(`${app.base}/c/${token}/i/${ids[1]}`)).text();
    const prevTag = /<a\b[^>]*\bdata-neighbour-prev\b[^>]*>/.exec(middle)?.[0];
    const nextTag = /<a\b[^>]*\bdata-neighbour-next\b[^>]*>/.exec(middle)?.[0];
    assert.ok(prevTag, "middle image has a previous");
    assert.ok(nextTag, "middle image has a next");
    assert.match(prevTag, new RegExp(`href="/c/${token}/i/${ids[2]}"`));
    assert.match(nextTag, new RegExp(`href="/c/${token}/i/${ids[0]}"`));

    const newest = await (await fetch(`${app.base}/c/${token}/i/${ids[2]}`)).text();
    assert.equal(
      /<a\b[^>]*\bdata-neighbour-prev\b/.test(newest),
      false,
      "no previous past the newest, not a wrap to the oldest"
    );
    assert.match(newest, /<span\b[^>]*\bdata-neighbour-prev\b/);

    const oldest = await (await fetch(`${app.base}/c/${token}/i/${ids[0]}`)).text();
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

test("two images sharing a created_at in a shared collection are still ordered and stepped correctly", async () => {
  const db = freshDb();
  const { token, ids } = shared(db, { images: ["alpha", "beta", "gamma"] });
  at(db, ids[0], "2026-08-10T10:00:02.000Z");
  at(db, ids[1], "2026-08-10T10:00:00.000Z");
  at(db, ids[2], "2026-08-10T10:00:00.000Z");

  const app = await startApp(db);
  try {
    const html = await (await fetch(`${app.base}/c/${token}/i/${ids[2]}`)).text();
    const prevTag = /<a\b[^>]*\bdata-neighbour-prev\b[^>]*>/.exec(html)?.[0];
    const nextTag = /<a\b[^>]*\bdata-neighbour-next\b[^>]*>/.exec(html)?.[0];
    assert.match(prevTag, new RegExp(`href="/c/${token}/i/${ids[0]}"`));
    assert.match(nextTag, new RegExp(`href="/c/${token}/i/${ids[1]}"`));
  } finally {
    app.stop();
    db.close();
  }
});

test("a trashed image in a shared collection is never offered as a neighbour", async () => {
  const db = freshDb();
  const { Generation } = models(db);
  const { token, ids } = shared(db, {
    images: ["kept one", "to trash", "kept two"],
  });
  at(db, ids[0], "2026-08-10T10:00:00.000Z");
  at(db, ids[1], "2026-08-10T10:00:01.000Z");
  at(db, ids[2], "2026-08-10T10:00:02.000Z");
  Generation.trash(ids[1]);

  const app = await startApp(db);
  try {
    const html = await (await fetch(`${app.base}/c/${token}/i/${ids[2]}`)).text();
    const nextTag = /<a\b[^>]*\bdata-neighbour-next\b[^>]*>/.exec(html)?.[0];
    assert.ok(nextTag);
    assert.match(
      nextTag,
      new RegExp(`href="/c/${token}/i/${ids[0]}"`),
      "the trashed image is skipped"
    );
    assert.equal(html.includes(`/i/${ids[1]}`), false);
  } finally {
    app.stop();
    db.close();
  }
});

test("an image in a different collection is never reachable as a neighbour", async () => {
  const db = freshDb();
  const { Collection } = models(db);
  const { token, ids } = shared(db, { images: ["mine one", "mine two"] });
  const other = Collection.add("Other", NOW);
  const outsider = anImage(db, "outside");
  Collection.addImage(outsider, other);
  at(db, ids[0], "2026-08-10T10:00:00.000Z");
  at(db, outsider, "2026-08-10T10:00:01.000Z");
  at(db, ids[1], "2026-08-10T10:00:02.000Z");

  const app = await startApp(db);
  try {
    const html = await (await fetch(`${app.base}/c/${token}/i/${ids[1]}`)).text();
    const nextTag = /<a\b[^>]*\bdata-neighbour-next\b[^>]*>/.exec(html)?.[0];
    assert.ok(nextTag);
    assert.match(nextTag, new RegExp(`href="/c/${token}/i/${ids[0]}"`));
    assert.equal(html.includes(`/i/${outsider}`), false);
  } finally {
    app.stop();
    db.close();
  }
});

test("a revoked token 404s a shared collection's neighbour URLs exactly as it 404s the page", async () => {
  const db = freshDb();
  const { Collection } = models(db);
  const { id, token, ids } = shared(db, { images: ["one", "two"] });
  at(db, ids[0], "2026-08-10T10:00:00.000Z");
  at(db, ids[1], "2026-08-10T10:00:01.000Z");

  const app = await startApp(db);
  try {
    const html = await (await fetch(`${app.base}/c/${token}/i/${ids[0]}`)).text();
    const prevTag = /<a\b[^>]*\bdata-neighbour-prev\b[^>]*>/.exec(html)?.[0];
    const prevHref = prevTag && /href="([^"]+)"/.exec(prevTag)?.[1];
    assert.ok(prevHref, "no previous link found to revoke against");

    Collection.unshare(id);
    assert.equal((await fetch(`${app.base}${prevHref}`)).status, 404);
    assert.equal((await fetch(`${app.base}/c/${token}/i/${ids[0]}`)).status, 404);
  } finally {
    app.stop();
    db.close();
  }
});

test("a shared collection's neighbour links leak nothing about the neighbour beyond its id", async () => {
  const db = freshDb();
  const { token, ids } = shared(db, {
    images: [
      "a secret prompt only the neighbour should carry",
      "the one you are looking at",
    ],
  });
  at(db, ids[0], "2026-08-10T10:00:00.000Z");
  at(db, ids[1], "2026-08-10T10:00:01.000Z");

  const app = await startApp(db);
  try {
    const html = await (await fetch(`${app.base}/c/${token}/i/${ids[1]}`)).text();
    assert.equal(
      html.includes("a secret prompt only the neighbour should carry"),
      false
    );
  } finally {
    app.stop();
    db.close();
  }
});

test("a one-image collection gets no stepping controls at all", async () => {
  const db = freshDb();
  const { token, ids } = shared(db, { images: ["the only one"] });

  const app = await startApp(db);
  try {
    const html = await (await fetch(`${app.base}/c/${token}/i/${ids[0]}`)).text();

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
    assert.match(html, /Back to/);
  } finally {
    app.stop();
    db.close();
  }
});

test("a second image brings the collection's stepping controls back", async () => {
  const db = freshDb();
  const { token, ids } = shared(db, { images: ["first", "second"] });
  at(db, ids[0], "2026-08-10T10:00:00.000Z");
  at(db, ids[1], "2026-08-10T10:00:01.000Z");

  const app = await startApp(db);
  try {
    const html = await (await fetch(`${app.base}/c/${token}/i/${ids[0]}`)).text();
    assert.match(html, /<a\b[^>]*\bdata-neighbour-prev\b/);
    assert.match(html, /<span\b[^>]*\bdata-neighbour-next\b/);
  } finally {
    app.stop();
    db.close();
  }
});
