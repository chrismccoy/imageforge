/**
 * Edit lineage tests
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

function models(db) {
  return require("../../../models").buildModels(db);
}

function anImage(db, prompt, extra = {}) {
  return Number(
    models(db).Generation.add(
      Object.assign(
        {
          filename: `${process.pid}-${prompt.replace(/\s/g, "-")}.png`,
          prompt,
          model: "gpt-image-2",
          size: "1024x1024",
        },
        extra
      )
    )
  );
}

test("generations carry an edited_from column", () => {
  const db = freshDb();
  const cols = db
    .prepare("PRAGMA table_info(generations)")
    .all()
    .map((c) => c.name);
  assert.ok(cols.includes("edited_from"));
});

test("an ordinary image has no source", () => {
  const db = freshDb();
  const id = anImage(db, "a cat");
  assert.equal(models(db).Generation.get(id).edited_from, null);
});

test("an edit records the image it came from", () => {
  const db = freshDb();
  const source = anImage(db, "a cat");
  const edited = anImage(db, "a cat in a red hat", { edited_from: source });
  assert.equal(models(db).Generation.get(edited).edited_from, source);
});

test("trashing the original leaves the edit alone", () => {
  const db = freshDb();
  const source = anImage(db, "a cat");
  const edited = anImage(db, "a cat in a red hat", { edited_from: source });

  models(db).Generation.trash(source);

  const row = models(db).Generation.get(edited);
  assert.ok(row, "the edit is still here");
  assert.equal(row.edited_from, source);
});
