/**
 * Moving saved choices off a retired model
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const schema = require("../../../db/schema");

function dbHolding({ setting, preferred }) {
  const db = new Database(":memory:");
  schema.init(db);
  db.prepare("UPDATE settings SET model = ? WHERE id = 1").run(setting);
  db.prepare(
    `INSERT INTO prompts (name, prompt, created_at, default_model)
     VALUES ('a', 'x', '2026-08-13T00:00:00.000Z', ?)`
  ).run(preferred);
  return db;
}

const settingOf = (db) => db.prepare("SELECT model FROM settings").get().model;
const preferredOf = (db) =>
  db.prepare("SELECT default_model FROM prompts").get().default_model;

test("the saved model moves off 1.5 at startup", () => {
  const db = dbHolding({ setting: "1.5", preferred: null });
  schema.init(db);
  assert.equal(settingOf(db), "2.5-sunburst");
});

test("a prompt's preferred model moves off 1.5 at startup", () => {
  const db = dbHolding({ setting: "2", preferred: "1.5" });
  schema.init(db);
  assert.equal(preferredOf(db), "2.5-sunburst");
});

test("choices that were never 1.5 are left alone", () => {
  const db = dbHolding({ setting: "2", preferred: "2.5-flare" });
  schema.init(db);
  assert.equal(settingOf(db), "2");
  assert.equal(preferredOf(db), "2.5-flare");
});

test("a prompt with no preference keeps having none", () => {
  const db = dbHolding({ setting: "2", preferred: null });
  schema.init(db);
  assert.equal(preferredOf(db), null);
});

test("images already made keep the model that made them", () => {
  const db = dbHolding({ setting: "1.5", preferred: null });
  db.prepare(
    `INSERT INTO generations (filename, prompt, model, size, created_at)
     VALUES ('a.png', '', 'gpt-image-1.5', '', '2026-08-13T00:00:00.000Z')`
  ).run();

  schema.init(db);

  assert.equal(
    db.prepare("SELECT model FROM generations").get().model,
    "gpt-image-1.5"
  );
  assert.equal(
    db.prepare("SELECT images FROM model_spend WHERE model = 'gpt-image-1.5'").get()
      .images,
    1
  );
});
