/**
 * Query criteria
 */

"use strict";

/**
 * A prepared-statement cache over a connection.
 */
function statementCache(db) {
  const cache = new Map();

  return function stmt(sql) {
    if (!cache.has(sql)) cache.set(sql, db.prepare(sql));
    return cache.get(sql);
  };
}

module.exports = { statementCache };
