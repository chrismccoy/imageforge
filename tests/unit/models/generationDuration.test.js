/**
 * Generation duration column tests
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");

const schema = require("../../../db/schema");
const buildGeneration = require("../../../models/generation");

function freshGenerations() {
  const db = new Database(":memory:");
  schema.init(db);
  return buildGeneration(db);
}

test("a saved image keeps how long it took", () => {
  const Generation = freshGenerations();
  const id = Generation.add({ filename: "a.png", prompt: "a cat", duration_ms: 8421 });

  assert.equal(Generation.get(id).duration_ms, 8421);
});

test("an image with no time stores null", () => {
  const Generation = freshGenerations();
  const none = Generation.add({ filename: "a.png", prompt: "a cat" });
  const junk = Generation.add({ filename: "b.png", prompt: "a dog", duration_ms: -3 });

  assert.equal(Generation.get(none).duration_ms, null);
  assert.equal(Generation.get(junk).duration_ms, null);
});

test("the list page reads the time", () => {
  const Generation = freshGenerations();
  Generation.add({ filename: "a.png", prompt: "a cat", duration_ms: 8421 });

  const [row] = Generation.page({ limit: 10, offset: 0 });
  assert.equal(row.duration_ms, 8421);
});
