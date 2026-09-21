/**
 * Shared collection model
 */

"use strict";

const { NOW, freshDb, models, anImage, tokens, at } = require("./setup");

const test = require("node:test");
const assert = require("node:assert/strict");

const { SHARE_TOKEN_LENGTH } = require("../../../utils/domain/shareToken");

test("the schema carries the new columns and the unique index", () => {
  const db = freshDb();
  const cols = db
    .prepare("PRAGMA table_info(collections)")
    .all()
    .map((c) => c.name);
  assert.ok(cols.includes("share_token"));
  assert.ok(cols.includes("public_title"));

  const settings = db
    .prepare("PRAGMA table_info(settings)")
    .all()
    .map((c) => c.name);
  assert.ok(settings.includes("public_collections"));

  const indexes = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
    .all()
    .map((r) => r.name);
  assert.ok(indexes.includes("idx_collections_share_token"));
});

test("sharing mints a token and keeps the title", () => {
  const db = freshDb();
  const { Collection } = models(db);
  const id = Collection.add("Acme Corp rebrand", NOW);

  const token = Collection.share(id, "Winter campaign", tokens("AAAAAAAAAA"));
  assert.equal(token, "AAAAAAAAAA");
  assert.equal(token.length, SHARE_TOKEN_LENGTH);

  const row = Collection.get(id);
  assert.equal(row.share_token, "AAAAAAAAAA");
  assert.equal(row.public_title, "Winter campaign");
  assert.equal(row.name, "Acme Corp rebrand", "the private name is untouched");
});

test("sharing without a title is refused and mints nothing", () => {
  const db = freshDb();
  const { Collection } = models(db);
  const id = Collection.add("Acme Corp rebrand", NOW);

  for (const title of ["", "   ", null, undefined]) {
    assert.equal(Collection.share(id, title, tokens("AAAAAAAAAA")), null);
  }
  assert.equal(Collection.get(id).share_token, null);
});

test("a token collision is retried rather than thrown", () => {
  const db = freshDb();
  const { Collection } = models(db);
  const first = Collection.add("One", NOW);
  const second = Collection.add("Two", NOW);

  Collection.share(first, "First", tokens("DUPLICATE1"));
  const token = Collection.share(
    second,
    "Second",
    tokens("DUPLICATE1", "FRESHTOKEN")
  );
  assert.equal(token, "FRESHTOKEN");
});

test("un-sharing clears the token, keeps the title, and re-sharing differs", () => {
  const db = freshDb();
  const { Collection } = models(db);
  const id = Collection.add("Acme", NOW);
  Collection.share(id, "Winter campaign", tokens("AAAAAAAAAA"));

  Collection.unshare(id);
  assert.equal(Collection.get(id).share_token, null);
  assert.equal(
    Collection.get(id).public_title,
    "Winter campaign",
    "so re-sharing does not ask again"
  );
  assert.equal(Collection.byToken("AAAAAAAAAA"), null, "the old link is dead");

  Collection.share(id, "Winter campaign", tokens("BBBBBBBBBB"));
  assert.equal(Collection.get(id).share_token, "BBBBBBBBBB");
  assert.equal(Collection.byToken("AAAAAAAAAA"), null, "and stays dead");
});

test("byToken finds only a live token", () => {
  const db = freshDb();
  const { Collection } = models(db);
  const id = Collection.add("Acme", NOW);
  Collection.share(id, "Winter", tokens("AAAAAAAAAA"));

  assert.equal(Collection.byToken("AAAAAAAAAA").id, id);
  assert.equal(Collection.byToken("nope"), null);
  assert.equal(Collection.byToken(""), null);
  assert.equal(Collection.byToken(null), null);
});

test("holds answers whether an image is in this collection", () => {
  const db = freshDb();
  const { Collection } = models(db);
  const inside = anImage(db, "a cat");
  const outside = anImage(db, "a dog");
  const mine = Collection.add("Mine", NOW);
  const other = Collection.add("Other", NOW);

  Collection.addImage(inside, mine);
  Collection.addImage(outside, other);

  assert.equal(Collection.holds(mine, inside), true);
  assert.equal(Collection.holds(mine, outside), false);
  assert.equal(Collection.holds(mine, 9999), false);
});

test("allImagesIn returns the collection's images, newest first", () => {
  const db = freshDb();
  const { Collection } = models(db);
  const one = anImage(db, "a cat");
  const two = anImage(db, "a dog");
  anImage(db, "a fish");
  const mine = Collection.add("Mine", NOW);
  Collection.addImages([one, two], mine);

  const rows = Collection.allImagesIn(mine);
  assert.deepEqual(
    rows.map((r) => r.prompt),
    ["a dog", "a cat"]
  );
  assert.ok(rows[0].filename, "the page needs the filename to serve bytes");
  assert.deepEqual(Collection.allImagesIn(Collection.add("Empty", NOW)), []);
});

test("imagesPage takes a slice, and countImages agrees with it", () => {
  const db = freshDb();
  const { Collection } = models(db);
  const mine = Collection.add("Mine", NOW);
  const ids = ["one", "two", "three", "four", "five"].map((p) => anImage(db, p));
  Collection.addImages(ids, mine);

  assert.equal(Collection.countImages(mine), 5);

  const first = Collection.imagesPage(mine, { limit: 2, offset: 0 });
  const second = Collection.imagesPage(mine, { limit: 2, offset: 2 });
  assert.equal(first.length, 2);
  assert.equal(second.length, 2);
  assert.deepEqual(
    first.map((r) => r.prompt),
    ["five", "four"]
  );
  assert.deepEqual(
    second.map((r) => r.prompt),
    ["three", "two"]
  );

  assert.deepEqual(Collection.imagesPage(mine, { limit: 2, offset: 99 }), []);

  assert.equal(Collection.allImagesIn(mine).length, 5);
});

test("neighboursIn steps through a collection's own order, ties on created_at broken by id", () => {
  const db = freshDb();
  const { Collection } = models(db);
  const mine = Collection.add("Mine", NOW);
  const [a, b, c] = ["a", "b", "c"].map((p) => anImage(db, p));
  Collection.addImages([a, b, c], mine);
  at(db, a, "2026-08-10T10:00:02.000Z");
  at(db, b, "2026-08-10T10:00:00.000Z");
  at(db, c, "2026-08-10T10:00:00.000Z");

  assert.deepEqual(Collection.neighboursIn(mine, a), { prev: null, next: c });
  assert.deepEqual(Collection.neighboursIn(mine, c), { prev: a, next: b });
  assert.deepEqual(Collection.neighboursIn(mine, b), { prev: c, next: null });
});

test("neighboursIn does not reach into another collection", () => {
  const db = freshDb();
  const { Collection } = models(db);
  const mine = Collection.add("Mine", NOW);
  const other = Collection.add("Other", NOW);
  const inside = anImage(db, "inside");
  const outside = anImage(db, "outside");
  Collection.addImage(inside, mine);
  Collection.addImage(outside, other);
  at(db, inside, "2026-08-10T10:00:00.000Z");
  at(db, outside, "2026-08-10T10:00:01.000Z");

  assert.deepEqual(Collection.neighboursIn(mine, inside), {
    prev: null,
    next: null,
  });
});

test("neighboursIn is null at both ends of a single-image collection", () => {
  const db = freshDb();
  const { Collection } = models(db);
  const mine = Collection.add("Mine", NOW);
  const only = anImage(db, "only");
  Collection.addImage(only, mine);

  assert.deepEqual(Collection.neighboursIn(mine, only), {
    prev: null,
    next: null,
  });
});

test("deleting a collection takes its link with it", () => {
  const db = freshDb();
  const { Collection } = models(db);
  const id = Collection.add("Acme", NOW);
  Collection.share(id, "Winter", tokens("AAAAAAAAAA"));

  Collection.remove(id);
  assert.equal(Collection.byToken("AAAAAAAAAA"), null);
});

test("the public collections toggle is off until set", () => {
  const db = freshDb();
  const { Settings } = models(db);
  const { createPublicAccess } = require("../../../services/publicAccess");
  const access = createPublicAccess(Settings);

  assert.equal(access.collections(), false);

  Settings.update({ public_collections: 1 });
  assert.equal(access.collections(), true);
});
