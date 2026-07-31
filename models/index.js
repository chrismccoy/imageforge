/**
 * Models setup
 *
 * Builds the data models over a database connection.
 */

"use strict";

const schema = require("../db/schema");
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
 * Create the tables and seed the settings row, if they are not there yet.
 */
function initSchema(db, { seedModel = normalizeModel(env.OPENAI_MODEL) } = {}) {
  schema.init(db, { seedModel });
  return db;
}

module.exports = { buildModels, initSchema };
