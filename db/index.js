/**
 * Database connection
 */

"use strict";

const fs = require("fs");
const Database = require("better-sqlite3");
const { DATA_DIR, DB_PATH } = require("../config/paths");

/**
 * Open the SQLite database
 */
function openDatabase(dbPath = DB_PATH) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  return db;
}

module.exports = { openDatabase };
