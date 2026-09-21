/**
 * Stats tests
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const schema = require("../../../db/schema");

function freshDb() {
  const db = new Database(":memory:");
  schema.init(db);
  return db;
}

function addAt(db, filename, model, createdAt, input, output) {
  db.prepare(
    `INSERT INTO generations
       (filename, prompt, model, size, created_at, usage_input_tokens, usage_output_tokens, usage_total_tokens)
     VALUES (?, '', ?, '', ?, ?, ?, ?)`
  ).run(filename, model, createdAt, input, output, (input || 0) + (output || 0));
}

test("counts are empty on an empty database", () => {
  const db = freshDb();
  const Stats = require("../../../models/stats")(db);

  assert.equal(Stats.total(), 0);
  assert.equal(Stats.countSince("2026-08-01T00:00:00.000Z"), 0);
  assert.deepEqual(Stats.byModel(), []);
});

test("countSince counts from a moment onwards", () => {
  const db = freshDb();
  addAt(db, "old.png", "gpt-image-2", "2026-07-01T00:00:00.000Z", 10, 20);
  addAt(db, "new.png", "gpt-image-2", "2026-08-09T00:00:00.000Z", 10, 20);
  const Stats = require("../../../models/stats")(db);

  assert.equal(Stats.total(), 2);
  assert.equal(Stats.countSince("2026-08-01T00:00:00.000Z"), 1);
  assert.equal(Stats.countSince("2026-01-01T00:00:00.000Z"), 2);
});

test("byModel groups and sums, uploads included", () => {
  const db = freshDb();
  addAt(db, "a.png", "gpt-image-2", "2026-08-09T00:00:00.000Z", 15, 196);
  addAt(db, "b.png", "gpt-image-2", "2026-08-09T00:00:00.000Z", 15, 196);
  addAt(db, "c.png", "gpt-image-1.5", "2026-08-09T00:00:00.000Z", 15, 1250);
  addAt(db, "d.png", "", "2026-08-09T00:00:00.000Z", null, null);

  const rows = require("../../../models/stats")(db).byModel();

  assert.equal(rows.length, 3);
  assert.equal(rows[0].model, "gpt-image-2");
  assert.equal(rows[0].images, 2);
  assert.equal(rows[0].inputTokens, 30);
  assert.equal(rows[0].outputTokens, 392);
  assert.equal(rows[0].totalTokens, 422);

  const uploads = rows.find((r) => r.model === "");
  assert.equal(uploads.images, 1);
  assert.equal(uploads.inputTokens, 0);
});

test("the ledger starts from the images an install already had", () => {
  const db = freshDb();
  addAt(db, "a.png", "gpt-image-2", "2026-08-09T00:00:00.000Z", 15, 196);
  addAt(db, "b.png", "gpt-image-2", "2026-08-09T00:00:00.000Z", 15, 196);
  db.prepare("DELETE FROM model_spend").run();

  schema.init(db);
  const first = require("../../../models/stats")(db).byModel();
  assert.equal(first[0].images, 2);
  assert.equal(first[0].inputTokens, 30);

  schema.init(db);
  assert.deepEqual(
    require("../../../models/stats")(db).byModel(),
    first,
    "a restart does not count them again"
  );
});

test("byModel reports how many rows actually carried token counts", () => {
  const db = freshDb();
  addAt(db, "counted.png", "gpt-image-2", "2026-08-09T00:00:00.000Z", 15, 196);
  addAt(db, "blank.png", "gpt-image-2", "2026-08-09T00:00:00.000Z", null, null);

  const row = require("../../../models/stats")(db).byModel()[0];

  assert.equal(row.images, 2);
  assert.equal(row.countedImages, 1);
});
