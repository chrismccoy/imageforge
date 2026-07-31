/**
 * Allocating a share token
 */

"use strict";

/**
 * Write a fresh token, trying again when the index refuses a duplicate.
 */
const ATTEMPTS = 5;

function allocateToken(makeToken, write, attempts = ATTEMPTS) {
  for (let i = 0; i < attempts; i += 1) {
    const token = makeToken();
    try {
      write(token);
      return token;
    } catch (err) {
      if (err.code !== "SQLITE_CONSTRAINT_UNIQUE") throw err;
    }
  }
  throw new Error("Could not allocate a share token.");
}

module.exports = { allocateToken, ATTEMPTS };
