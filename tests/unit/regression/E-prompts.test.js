/**
 * Prompts controller: pin flag, sort keys in replies, name keys vs NOCASE
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");

const schema = require("../../../db/schema");
const { buildModels } = require("../../../models");
const buildController = require("../../../controllers/promptsController");
const { sortKeyFor } = require("../../../utils/domain/promptSort");

function setup() {
  const db = new Database(":memory:");
  schema.init(db);
  const models = buildModels(db);
  return { db, models, ctrl: buildController({ models }) };
}

function fakeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test("a JSON false or a 'false' string unpins rather than pins", () => {
  const { db, models, ctrl } = setup();
  const id = models.Prompt.add("Zulu", "x");

  for (const pinned of [false, "false", 0, "0"]) {
    models.Prompt.setPinned(id, true);
    const res = fakeRes();
    ctrl.pin({ params: { id: String(id) }, body: { pinned } }, res);
    assert.equal(res.body.pinned, 0, `pinned: ${JSON.stringify(pinned)}`);
  }

  const res = fakeRes();
  ctrl.pin({ params: { id: String(id) }, body: { pinned: true } }, res);
  assert.equal(res.body.pinned, 1);
  db.close();
});

test("rating answers the row's new sort key for the page's sort", () => {
  const { db, models, ctrl } = setup();
  const id = models.Prompt.add("Zulu", "x");

  const res = fakeRes();
  ctrl.rate(
    { params: { id: String(id), value: "4" }, body: { sort: "rating" } },
    res
  );
  assert.equal(res.body.rating, 4);
  assert.equal(res.body.sortKey, "0|01|zulu");

  const byName = fakeRes();
  ctrl.rate({ params: { id: String(id), value: "2" }, body: undefined }, byName);
  assert.equal(byName.body.sortKey, "zulu");
  db.close();
});

test("pinning answers the row's sort key too", () => {
  const { db, models, ctrl } = setup();
  const id = models.Prompt.add("Bravo", "x");
  models.Prompt.setRating(id, 5);

  const res = fakeRes();
  ctrl.pin(
    { params: { id: String(id) }, body: { pinned: "1", sort: "rating" } },
    res
  );
  assert.equal(res.body.sortKey, "0|00|bravo");
  db.close();
});

test("a name key folds A-Z only, as SQLite NOCASE does", () => {
  assert.equal(sortKeyFor({ name: "Émile Zola" }, "name"), "Émile zola");
});

test("name keys order non-ASCII names the way the database does", () => {
  const { db, models } = setup();
  ["éa", "Éz", "apple", "Zulu"].forEach((name) => models.Prompt.add(name, "x"));

  const rows = models.Prompt.page({ sort: "name", limit: 50, offset: 0 });
  const fromDb = rows.map((row) => row.name);
  const byKey = rows
    .map((row) => ({ name: row.name, key: sortKeyFor(row, "name") }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((row) => row.name);

  assert.deepEqual(byKey, fromDb);
  db.close();
});
