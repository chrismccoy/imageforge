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
  if (typeof raw !== "number" && typeof raw !== "string") return null;
  if (!/^[1-9]\d*$/.test(String(raw))) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

/**
 * Read a form or JSON flag. Off for false, 0, "", "0", "false", "off", "no".
 */
function parseFlag(raw) {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  const text = toTrimmedString(
    Array.isArray(raw) ? raw[raw.length - 1] : raw
  ).toLowerCase();
  return text !== "" && !["0", "false", "off", "no"].includes(text);
}

module.exports = { toTrimmedString, parseId, parseFlag };
