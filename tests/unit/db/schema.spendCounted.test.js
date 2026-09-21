/**
 * The spend ledger's insert rule
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

function insert(db, filename, model, spendCounted) {
  db.prepare(
    `INSERT INTO generations (filename, prompt, model, size, created_at, spend_counted)
     VALUES (?, '', ?, '', '2026-08-13T00:00:00.000Z', ?)`
  ).run(filename, model, spendCounted);
}

function images(db, model) {
  const row = db
    .prepare("SELECT images FROM model_spend WHERE model = ?")
    .get(model);
  return row ? row.images : 0;
}

test("a row nothing has accounted for is counted on insert", () => {
  const db = freshDb();
  insert(db, "a.png", "gpt-image-2", 0);
  assert.equal(images(db, "gpt-image-2"), 1);
});

test("a row already accounted for is not counted again", () => {
  const db = freshDb();
  insert(db, "a.png", "gpt-image-2", 1);
  assert.equal(images(db, "gpt-image-2"), 0);
});

test("spend_counted defaults to 0, so a caller that says nothing is counted", () => {
  const db = freshDb();
  db.prepare(
    `INSERT INTO generations (filename, prompt, model, size, created_at)
     VALUES ('a.png', '', 'gpt-image-2', '', '2026-08-13T00:00:00.000Z')`
  ).run();
  assert.equal(images(db, "gpt-image-2"), 1);
});

test("a NULL from a hand-run migration counts as not yet accounted for", () => {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE generations (
      id                        INTEGER PRIMARY KEY AUTOINCREMENT,
      filename                  TEXT NOT NULL,
      prompt                    TEXT NOT NULL DEFAULT '',
      prompt_id                 INTEGER,
      model                     TEXT NOT NULL DEFAULT '',
      size                      TEXT NOT NULL DEFAULT '',
      created_at                TEXT NOT NULL,
      share_token               TEXT,
      favorite                  INTEGER NOT NULL DEFAULT 0,
      usage_total_tokens        INTEGER,
      usage_input_tokens        INTEGER,
      usage_output_tokens       INTEGER,
      usage_input_text_tokens   INTEGER,
      usage_input_image_tokens  INTEGER,
      usage_output_text_tokens  INTEGER,
      usage_output_image_tokens INTEGER,
      deleted_at                TEXT,
      edited_from               INTEGER
    );
  `);

  db.exec("ALTER TABLE generations ADD COLUMN spend_counted INTEGER;");

  schema.init(db);

  db.prepare(
    `INSERT INTO generations (filename, prompt, model, size, created_at)
     VALUES ('uploaded.png', '', 'gpt-image-2', '', '2026-08-13T00:00:00.000Z')`
  ).run();

  assert.equal(
    images(db, "gpt-image-2"),
    1,
    "an absent answer means nobody has accounted for it, so it is counted"
  );
});

test("a stale trigger is replaced rather than left in place", () => {
  const db = freshDb();

  db.exec(`
    DROP TRIGGER record_model_spend;
    CREATE TRIGGER record_model_spend AFTER INSERT ON generations
    BEGIN
      INSERT INTO model_spend (model, images) VALUES (NEW.model, 1)
      ON CONFLICT(model) DO UPDATE SET images = images + 1;
    END;
  `);

  schema.init(db);

  const sql = db
    .prepare("SELECT sql FROM sqlite_master WHERE name = 'record_model_spend'")
    .get().sql;

  assert.match(sql, /WHEN COALESCE\(NEW\.spend_counted, 0\) = 0/);

  insert(db, "already-paid-for.png", "gpt-image-2", 1);
  assert.equal(images(db, "gpt-image-2"), 0);
});
