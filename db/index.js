/**
 * Database connection
 */

"use strict";

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { DB_PATH } = require("../config/paths");

/**
 * Open the SQLite database
 */
function openDatabase(dbPath = DB_PATH) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  return db;
}

module.exports = { openDatabase };
