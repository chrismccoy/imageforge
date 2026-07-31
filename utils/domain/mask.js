/**
 * Key masking
 *
 * Hides most of a secret for display
 */

"use strict";

const { toTrimmedString } = require("./coerce");

const HEAD = 3;
const TAIL = 4;

/**
 * Mask a secret, keeping only its first three and last four characters.
 */
function maskKey(key) {
  const cleaned = toTrimmedString(key);
  if (!cleaned) return "";
  if (cleaned.length <= HEAD + TAIL) return "…";
  return `${cleaned.slice(0, HEAD)}…${cleaned.slice(-TAIL)}`;
}

module.exports = { maskKey };
