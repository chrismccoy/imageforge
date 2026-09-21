/**
 * Output per day
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");

const schema = require("../../../db/schema");

const NOW = new Date("2026-08-22T00:00:00.000Z");

const EXPECTED_30_DAY_WINDOW = [
  "2026-07-24",
  "2026-07-25",
  "2026-07-26",
  "2026-07-27",
  "2026-07-28",
  "2026-07-29",
  "2026-07-30",
  "2026-07-31",
  "2026-08-01",
  "2026-08-02",
  "2026-08-03",
  "2026-08-04",
  "2026-08-05",
  "2026-08-06",
  "2026-08-07",
  "2026-08-08",
  "2026-08-09",
  "2026-08-10",
  "2026-08-11",
  "2026-08-12",
  "2026-08-13",
  "2026-08-14",
  "2026-08-15",
  "2026-08-16",
  "2026-08-17",
  "2026-08-18",
  "2026-08-19",
  "2026-08-20",
  "2026-08-21",
  "2026-08-22",
];

function freshDb() {
  const db = new Database(":memory:");
  schema.init(db);
  return db;
}

function models(db) {
  return require("../../../models").buildModels(db);
}

function imageOn(db, iso, prompt, model = "gpt-image-1.5") {
  const { Generation } = models(db);
  const id = Number(
    Generation.add({
      filename: `${process.pid}-perday-${prompt}.png`,
      prompt,
      model,
      size: "1024x1024",
    })
  );
  db.prepare("UPDATE generations SET created_at = ? WHERE id = ?").run(iso, id);
  return id;
}

test("a day with images reports how many", () => {
  const db = freshDb();
  imageOn(db, "2026-08-20T09:00:00.000Z", "one");
  imageOn(db, "2026-08-20T11:00:00.000Z", "two");
  imageOn(db, "2026-08-21T09:00:00.000Z", "three");

  const rows = models(db).Stats.perDay(7, NOW);
  const on = (day) =>
    rows.filter((row) => row.day === day).reduce((n, row) => n + row.images, 0);

  assert.equal(on("2026-08-20"), 2);
  assert.equal(on("2026-08-21"), 1);
  db.close();
});

test("a day with nothing still comes back", () => {
  const db = freshDb();
  imageOn(db, "2026-08-20T09:00:00.000Z", "one");

  const rows = models(db).Stats.perDay(30, NOW);
  const days = [...new Set(rows.map((row) => row.day))].sort();

  assert.deepEqual(
    days,
    EXPECTED_30_DAY_WINDOW,
    "the exact 30-day window, not merely 30 dates"
  );
  assert.ok(
    rows.some((row) => row.images === 0),
    "at least one quiet day"
  );
  db.close();
});

test("nothing older than the window is counted", () => {
  const db = freshDb();
  imageOn(db, "2020-01-01T09:00:00.000Z", "ancient");

  const rows = models(db).Stats.perDay(7, NOW);
  assert.equal(
    rows.reduce((n, row) => n + row.images, 0),
    0
  );
  db.close();
});

test("tokens come back grouped by the model that spent them", () => {
  const db = freshDb();
  const idA = imageOn(db, "2026-08-20T09:00:00.000Z", "counted-a", "gpt-image-1.5");
  const idB = imageOn(db, "2026-08-20T10:00:00.000Z", "counted-b", "gpt-image-2");
  db.prepare(
    "UPDATE generations SET usage_input_tokens = 100, usage_output_tokens = 400, usage_total_tokens = 500 WHERE id = ?"
  ).run(idA);
  db.prepare(
    "UPDATE generations SET usage_input_tokens = 30, usage_output_tokens = 90, usage_total_tokens = 120 WHERE id = ?"
  ).run(idB);

  const rowsOnDay = models(db)
    .Stats.perDay(7, NOW)
    .filter((r) => r.day === "2026-08-20");

  assert.equal(
    rowsOnDay.length,
    2,
    "one row per model, not one merged row for the day"
  );

  const byModel = Object.fromEntries(rowsOnDay.map((r) => [r.model, r]));
  assert.equal(byModel["gpt-image-1.5"].inputTokens, 100);
  assert.equal(byModel["gpt-image-1.5"].outputTokens, 400);
  assert.equal(byModel["gpt-image-2"].inputTokens, 30);
  assert.equal(byModel["gpt-image-2"].outputTokens, 90);
  db.close();
});

test("a trashed image still counts on the day it was made", () => {
  const db = freshDb();
  const { Generation } = models(db);
  const id = imageOn(db, "2026-08-20T09:00:00.000Z", "trashed-later");
  Generation.trash(id);

  const rows = models(db).Stats.perDay(7, NOW);
  const on = (day) =>
    rows.filter((row) => row.day === day).reduce((n, row) => n + row.images, 0);

  assert.equal(on("2026-08-20"), 1);
  db.close();
});

test("a purged image no longer counts on the day it was made", () => {
  const db = freshDb();
  const { Generation } = models(db);
  const id = imageOn(db, "2026-08-20T09:00:00.000Z", "purged-later");
  Generation.purge(id);

  const rows = models(db).Stats.perDay(7, NOW);
  const on = (day) =>
    rows.filter((row) => row.day === day).reduce((n, row) => n + row.images, 0);

  assert.equal(on("2026-08-20"), 0);
  db.close();
});
