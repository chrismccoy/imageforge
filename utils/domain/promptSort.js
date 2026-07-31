/**
 * The key a prompt row was sorted by
 */

"use strict";

const RANK_WIDTH = 2;

/**
 * A prompt's name as the database compares it.
 */
function nameKey(row) {
  return String(row.name == null ? "" : row.name).toLowerCase();
}

/**
 * The sort key for a row under a given sort.
 */
function sortKeyFor(row, sort) {
  if (sort !== "rating") return nameKey(row);

  const rated = row.rating === null || row.rating === undefined ? 1 : 0;
  const rank = rated ? 0 : 5 - Number(row.rating);

  return `${rated}|${String(rank).padStart(RANK_WIDTH, "0")}|${nameKey(row)}`;
}

module.exports = { sortKeyFor };
