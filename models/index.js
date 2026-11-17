/**
 * Models setup
 *
 * Builds the data models over a database connection.
 */

"use strict";

const Database = require("better-sqlite3");
const schema = require("../db/schema");
const { gapsBetween } = require("../db/schemaDiff");
const { env } = require("../config/env");
const { normalizeModel } = require("../config/images");
const { buildOperations } = require("./operations");

/**
 * Build the models against a connection whose tables already exist.
 */
function buildModels(db) {
  const models = {
    Prompt: require("./prompt")(db),
    Generation: require("./generation")(db),
    Settings: require("./settings")(db),
    ModelPrice: require("./modelPrice")(db),
    Stats: require("./stats")(db),
    Spend: require("./spend")(db),
    Category: require("./category")(db),
    Collection: require("./collection")(db),
  };

  models.ops = buildOperations(db, models);

  return models;
}

/**
 * Refuse a database that is missing columns db/schema.js expects. Startup
 * creates missing tables, views and indexes itself, but cannot add columns.
 */
function assertNoMissingColumns(db) {
  const want = new Database(":memory:");
  schema.init(want);
  const missing = gapsBetween(want, db).filter((gap) => gap.kind === "column");
  want.close();
  if (!missing.length) return;

  throw new Error(
    [
      "The database is missing columns this version needs. Back up the database, then run:",
      ...missing.map((gap) => `  ${gap.sql}`),
      "Or run `node scripts/schema-gaps.js` to list them.",
    ].join("\n")
  );
}

/**
 * Create the tables and seed the settings row, if they are not there yet.
 */
function initSchema(db, { seedModel = normalizeModel(env.OPENAI_MODEL) } = {}) {
  assertNoMissingColumns(db);
  schema.init(db, { seedModel });
  return db;
}

module.exports = { buildModels, initSchema, assertNoMissingColumns };
