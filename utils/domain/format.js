/**
 * Formatting
 */

"use strict";

/**
 * A byte count as something readable.
 */
function readableBytes(bytes) {
  if (!Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * A date as YYYY-MM-DD, for the downloads that carry one in their name.
 */
function isoDate(when = new Date()) {
  return when.toISOString().slice(0, 10);
}

module.exports = { readableBytes, isoDate };
