/**
 * Database schema and seed
 */

"use strict";

const { DEFAULT_SIZE, DEFAULT_MODEL } = require("../config/images");

/**
 * The tables this app owns.
 */
function tables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS prompts (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      prompt        TEXT NOT NULL,
      created_at    TEXT NOT NULL,
      category_id   INTEGER,
      rating        INTEGER,
      default_size  TEXT,
      default_model TEXT,
      notes         TEXT,
      pinned        INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS generations (
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
      edited_from               INTEGER,
      spend_counted             INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS settings (
      id                INTEGER PRIMARY KEY CHECK (id = 1),
      default_size      TEXT NOT NULL,
      model             TEXT NOT NULL DEFAULT '1.5',
      api_key           TEXT NOT NULL DEFAULT '',
      page_size         INTEGER NOT NULL DEFAULT 0,
      public_share      INTEGER,
      public_gallery    INTEGER,
      public_share_slug INTEGER,
      public_collections INTEGER,
      public_favourites  INTEGER,
      favourites_token   TEXT,
      list_view          INTEGER NOT NULL DEFAULT 0,

      brand_name         TEXT,
      brand_icon         TEXT,

      brand_mark         INTEGER
    );

    CREATE TABLE IF NOT EXISTS model_spend (
      model          TEXT PRIMARY KEY,
      images         INTEGER NOT NULL DEFAULT 0,
      counted_images INTEGER NOT NULL DEFAULT 0,
      input_tokens   INTEGER NOT NULL DEFAULT 0,
      output_tokens  INTEGER NOT NULL DEFAULT 0,
      total_tokens   INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS model_prices (
      model              TEXT PRIMARY KEY,
      input_per_million  REAL NOT NULL,
      output_per_million REAL NOT NULL,
      updated_at         TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL COLLATE NOCASE UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS collections (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL COLLATE NOCASE UNIQUE,
      created_at   TEXT NOT NULL,
      share_token  TEXT,
      public_title TEXT
    );

    CREATE TABLE IF NOT EXISTS generation_collections (
      generation_id INTEGER NOT NULL,
      collection_id INTEGER NOT NULL,
      PRIMARY KEY (generation_id, collection_id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      sid    TEXT PRIMARY KEY,
      sess   TEXT NOT NULL,
      expire INTEGER NOT NULL
    );
  `);
}

/**
 * The views read through.
 *
 * After tables(), which they select from.
 */
function views(db) {
  db.exec(`
    CREATE VIEW IF NOT EXISTS live_generations AS
      SELECT * FROM generations WHERE deleted_at IS NULL;
  `);
}

/**
 * The uniqueness the token columns rely on.
 *
 * After tables(), which they index.
 */
function indexes(db) {
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_generations_share_token
      ON generations(share_token);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_share_token
      ON collections(share_token);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_favourites_token
      ON settings(favourites_token);
  `);
}

/**
 * The rules the database keeps for itself.
 *
 * Last: this one reads generations and writes model_spend, so both have to
 * exist first.
 */
function triggers(db) {
  db.exec(`
    DROP TRIGGER IF EXISTS record_model_spend;

    CREATE TRIGGER record_model_spend
    AFTER INSERT ON generations
    WHEN COALESCE(NEW.spend_counted, 0) = 0
    BEGIN
      INSERT INTO model_spend (
        model, images, counted_images, input_tokens, output_tokens, total_tokens
      ) VALUES (
        NEW.model,
        1,
        CASE WHEN NEW.usage_input_tokens IS NULL THEN 0 ELSE 1 END,
        COALESCE(NEW.usage_input_tokens, 0),
        COALESCE(NEW.usage_output_tokens, 0),
        COALESCE(NEW.usage_total_tokens, 0)
      )
      ON CONFLICT(model) DO UPDATE SET
        images         = images + 1,
        counted_images = counted_images + excluded.counted_images,
        input_tokens   = input_tokens + excluded.input_tokens,
        output_tokens  = output_tokens + excluded.output_tokens,
        total_tokens   = total_tokens + excluded.total_tokens;
    END;
  `);
}

/**
 * Create the tables and add the first settings row if it is not there yet.
 */
function init(db, { seedModel = DEFAULT_MODEL } = {}) {
  tables(db);
  views(db);
  indexes(db);
  triggers(db);

  db.prepare(
    "INSERT OR IGNORE INTO settings (id, default_size, model, api_key) VALUES (1, ?, ?, '')"
  ).run(DEFAULT_SIZE, seedModel);

  seedSpendFromGenerations(db);
}

/**
 * Start the ledger off from the images already saved.
 */
function seedSpendFromGenerations(db) {
  const seeded = db.prepare("SELECT 1 FROM model_spend LIMIT 1").get();
  if (seeded) return;

  db.prepare(
    `INSERT INTO model_spend (
       model, images, counted_images, input_tokens, output_tokens, total_tokens
     )
     SELECT model,
            COUNT(*),
            COUNT(usage_input_tokens),
            COALESCE(SUM(usage_input_tokens), 0),
            COALESCE(SUM(usage_output_tokens), 0),
            COALESCE(SUM(usage_total_tokens), 0)
     FROM generations
     GROUP BY model`
  ).run();
}

module.exports = { init };
