/**
 * Allocating a share token
 */

"use strict";

const ATTEMPTS = 5;

/**
 * Write a fresh token, trying again when the index refuses a duplicate.
 * Null when the write matched no row.
 */
function allocateToken(makeToken, write, attempts = ATTEMPTS) {
  for (let i = 0; i < attempts; i += 1) {
    const token = makeToken();
    try {
      const result = write(token);
      return result && result.changes === 0 ? null : token;
    } catch (err) {
      if (err.code !== "SQLITE_CONSTRAINT_UNIQUE") throw err;
    }
  }
  throw new Error("Could not allocate a share token.");
}

module.exports = { allocateToken, ATTEMPTS };
