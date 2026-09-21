/**
 * The favourites link, and the starred set
 */

"use strict";

const { freshDb, models, anImage, at } = require("./setup");

const test = require("node:test");
const assert = require("node:assert/strict");

const { SHARE_TOKEN_LENGTH } = require("../../../utils/domain/shareToken");

test("favouriteNeighbours steps through the starred set's own order, ties on created_at broken by id", () => {
  const db = freshDb();
  const { Generation } = models(db);
  const [a, b, c] = ["a", "b", "c"].map((p) => anImage(db, p));
  [a, b, c].forEach((id) => Generation.toggleFavorite(id));
  at(db, a, "2026-08-10T10:00:02.000Z");
  at(db, b, "2026-08-10T10:00:00.000Z");
  at(db, c, "2026-08-10T10:00:00.000Z");

  assert.deepEqual(Generation.favouriteNeighbours(a), { prev: null, next: c });
  assert.deepEqual(Generation.favouriteNeighbours(c), { prev: a, next: b });
  assert.deepEqual(Generation.favouriteNeighbours(b), { prev: c, next: null });
});

test("favouriteNeighbours ignores an unstarred image entirely", () => {
  const db = freshDb();
  const { Generation } = models(db);
  const starred = anImage(db, "starred");
  const notStarred = anImage(db, "not starred");
  Generation.toggleFavorite(starred);
  at(db, starred, "2026-08-10T10:00:00.000Z");
  at(db, notStarred, "2026-08-10T10:00:01.000Z");

  assert.deepEqual(Generation.favouriteNeighbours(starred), {
    prev: null,
    next: null,
  });
});

test("favouriteNeighbours skips a trashed-but-starred image", () => {
  const db = freshDb();
  const { Generation } = models(db);
  const [a, b, c] = ["a", "b", "c"].map((p) => anImage(db, p));
  [a, b, c].forEach((id) => Generation.toggleFavorite(id));
  at(db, a, "2026-08-10T10:00:00.000Z");
  at(db, b, "2026-08-10T10:00:01.000Z");
  at(db, c, "2026-08-10T10:00:02.000Z");
  Generation.trash(b);

  assert.deepEqual(Generation.favouriteNeighbours(c), { prev: null, next: a });
});

test("the settings row carries a favourites token", () => {
  const db = freshDb();
  const cols = db
    .prepare("PRAGMA table_info(settings)")
    .all()
    .map((c) => c.name);
  assert.ok(cols.includes("public_favourites"));
  assert.ok(cols.includes("favourites_token"));
});

test("sharing mints a token, and un-sharing clears it", () => {
  const db = freshDb();
  const { Settings } = models(db);

  assert.equal(Settings.get().favourites_token, null);
  const token = Settings.shareFavourites(() => "FAVTOKEN01");
  assert.equal(token, "FAVTOKEN01");
  assert.equal(token.length, SHARE_TOKEN_LENGTH);
  assert.equal(Settings.get().favourites_token, "FAVTOKEN01");

  Settings.unshareFavourites();
  assert.equal(Settings.get().favourites_token, null);

  assert.equal(
    Settings.shareFavourites(() => "FAVTOKEN02"),
    "FAVTOKEN02"
  );
});
