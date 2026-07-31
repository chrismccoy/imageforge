/**
 * Token counts
 */

"use strict";

/**
 * A token count, or null when the value is not one.
 */
function tokenCount(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

module.exports = { tokenCount };
