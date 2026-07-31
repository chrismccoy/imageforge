/**
 * Coercions
 */

"use strict";

/**
 * Coerce any value to a trimmed string, treating null/undefined as empty.
 */
function toTrimmedString(value) {
  return String(value ?? "").trim();
}

/**
 * Read a value as a positive whole number, or null when it is not one.
 */
function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

module.exports = { toTrimmedString, parseId };
