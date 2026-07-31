/**
 * Request helpers
 */

"use strict";

const { MAX_PAGE_SIZE } = require("../../config/limits");
const { normalizeSize } = require("../../config/images");
const { parseId } = require("../domain/coerce");

/**
 * Read a field from a body or query object as a string.
 */
function field(source, key, { trim = true } = {}) {
  const value = source && source[key] != null ? source[key] : "";
  const s = String(value);
  return trim ? s.trim() : s;
}

const ID_LIST_MAX = MAX_PAGE_SIZE * 2;

/**
 * Read a repeated field as a list of ids.
 */
function idList(source, key, max = ID_LIST_MAX) {
  const raw = source && source[key] != null ? source[key] : [];
  const values = Array.isArray(raw) ? raw : [raw];

  const ids = [];
  for (const value of values) {
    if (ids.length >= max) break;
    const id = parseId(value);
    if (id !== null && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * The size a posted form asked for, forced to one the API accepts.
 */
function sizeFrom(source, fallback) {
  return normalizeSize(field(source, "size", { trim: false }), fallback);
}

/**
 * The rows a repeated id field names, dropping the ones that have since gone.
 */
function idRows(source, key, get, max = ID_LIST_MAX) {
  return idList(source, key, max)
    .map((id) => get(id))
    .filter(Boolean);
}

module.exports = { field, sizeFrom, idList, idRows, ID_LIST_MAX };
