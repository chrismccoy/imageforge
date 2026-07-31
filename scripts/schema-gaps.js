/**
 * Schema gaps
 *
 * Lists what a database is missing compared with what db/schema.js expects.
 *
 *   node scripts/schema-gaps.js
 *   node scripts/schema-gaps.js /path/to/other.db
 */

"use strict";

const Database = require("better-sqlite3");
const schema = require("../db/schema");
const { DB_PATH } = require("../config/paths");
const { gapsBetween } = require("../db/schemaDiff");

const target = process.argv[2] || DB_PATH;

const want = new Database(":memory:");
schema.init(want);

let live;
try {
  live = new Database(target, { readonly: true });
} catch (err) {
  console.error(`Could not open ${target}: ${err.message}`);
  process.exit(2);
}

const gaps = gapsBetween(want, live);

console.log(`Database: ${target}\n`);

if (!gaps.length) {
  console.log("Up to date. Nothing to run.");
  process.exit(0);
}

const startupMade = gaps.filter((g) => g.kind === "table" || g.kind === "view");
if (startupMade.length) {
  console.log("Missing, but created by startup on its own:");
  startupMade.forEach((g) => console.log(`  ${g.kind} ${g.table}`));
  console.log("");
}

const statements = gaps.filter((g) => g.sql);
if (statements.length) {
  console.log("Run these, after stopping the app and taking a backup:\n");
  console.log(`  sqlite3 ${target} ".backup ${target}.bak"`);
  console.log(`  sqlite3 ${target}`);
  console.log("");
  statements.forEach((g) => console.log(`    ${g.sql}`));
  console.log("");
}

process.exit(1);
