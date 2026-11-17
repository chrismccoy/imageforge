/**
 * Startup refuses a database missing columns
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const schema = require("../../../db/schema");
const { initSchema } = require("../../../models");

function dbWithout(table, column) {
  const db = new Database(":memory:");
  schema.init(db);
  db.exec("DROP VIEW IF EXISTS live_generations");
  db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
  return db;
}

test("a fresh database starts", () => {
  const db = new Database(":memory:");
  assert.doesNotThrow(() => initSchema(db));
});

test("an up-to-date database starts", () => {
  const db = new Database(":memory:");
  schema.init(db);
  assert.doesNotThrow(() => initSchema(db));
});

test("a database missing a column is refused with the statement to run", () => {
  const db = dbWithout("generations", "duration_ms");
  assert.throws(
    () => initSchema(db),
    /ALTER TABLE generations ADD COLUMN duration_ms INTEGER;/
  );
});

test("a missing view alone does not block startup", () => {
  const db = new Database(":memory:");
  schema.init(db);
  db.exec("DROP VIEW live_generations");
  assert.doesNotThrow(() => initSchema(db));
});
