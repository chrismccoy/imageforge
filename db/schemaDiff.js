/**
 * Schema differences
 */

"use strict";

/**
 * The names of one kind of object in a database.
 */
function names(db, type) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = ?")
    .all(type)
    .map((row) => row.name)
    .filter((name) => !name.startsWith("sqlite_"));
}

/**
 * The columns of a table.
 */
function columns(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all();
}

/**
 * What `live` is missing that `want` has.
 */
function gapsBetween(want, live) {
  const gaps = [];

  for (const table of names(want, "table")) {
    if (!names(live, "table").includes(table)) {
      gaps.push({ kind: "table", table, sql: null });
      continue;
    }

    const have = columns(live, table).map((c) => c.name);
    for (const column of columns(want, table).filter(
      (c) => !have.includes(c.name)
    )) {
      gaps.push({
        kind: "column",
        table,
        sql: `ALTER TABLE ${table} ADD COLUMN ${column.name} ${column.type};`,
      });
    }
  }

  for (const view of names(want, "view")) {
    if (names(live, "view").includes(view)) continue;
    gaps.push({ kind: "view", table: view, sql: null });
  }

  for (const index of names(want, "index")) {
    if (names(live, "index").includes(index)) continue;
    const row = want
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?")
      .get(index);
    gaps.push({ kind: "index", table: index, sql: `${row.sql};` });
  }

  return gaps;
}

module.exports = { gapsBetween };
