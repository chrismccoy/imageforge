/**
 * The key a row is sorted by
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");

const schema = require("../../../../db/schema");
const { buildModels } = require("../../../../models");
const { sortKeyFor } = require("../../../../utils/domain/promptSort");

test("by name, the key is the name as it is compared", () => {
  assert.equal(sortKeyFor({ name: "Zulu", rating: null }, "name"), "zulu");
  assert.equal(sortKeyFor({ name: "alpha", rating: 3 }, "name"), "alpha");
});

test("by rating, a higher rating sorts before a lower one", () => {
  const five = sortKeyFor({ name: "b", rating: 5 }, "rating");
  const one = sortKeyFor({ name: "a", rating: 1 }, "rating");

  assert.ok(five < one, `${five} should sort before ${one}`);
});

test("by rating, unrated comes last however its name reads", () => {
  const rated = sortKeyFor({ name: "zulu", rating: 1 }, "rating");
  const unrated = sortKeyFor({ name: "alpha", rating: null }, "rating");

  assert.ok(rated < unrated, `${rated} should sort before ${unrated}`);
});

test("two prompts of the same rating fall back to the name", () => {
  const alpha = sortKeyFor({ name: "Alpha", rating: 3 }, "rating");
  const zulu = sortKeyFor({ name: "Zulu", rating: 3 }, "rating");

  assert.ok(alpha < zulu);
});

test("an unknown sort key is the name sort, as the database has it", () => {
  assert.equal(sortKeyFor({ name: "Zulu", rating: 5 }, "spiral"), "zulu");
});

function agreesWithTheDatabase(sort) {
  const db = new Database(":memory:");
  schema.init(db);
  const { Prompt } = buildModels(db);

  const made = [
    ["Delta", 3],
    ["alpha", null],
    ["Zulu", 5],
    ["Bravo", 1],
    ["charlie", 5],
    ["Echo", null],
  ];
  made.forEach(([name, rating]) => {
    const id = Prompt.add(name, "x");
    if (rating !== null) Prompt.setRating(id, rating);
  });

  const fromDb = Prompt.page({ sort, limit: 50, offset: 0 }).map((r) => r.name);

  const sorted = Prompt.page({ sort, limit: 50, offset: 0 })
    .map((row) => ({ name: row.name, key: sortKeyFor(row, sort) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((row) => row.name);

  db.close();
  return { fromDb, sorted };
}

test("sorting by the key matches the name order the database gives", () => {
  const { fromDb, sorted } = agreesWithTheDatabase("name");
  assert.deepEqual(sorted, fromDb);
});

test("sorting by the key matches the rating order the database gives", () => {
  const { fromDb, sorted } = agreesWithTheDatabase("rating");
  assert.deepEqual(sorted, fromDb);
});
