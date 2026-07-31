/**
 * Search terms
 */

"use strict";

/**
 * A LIKE pattern matching the term anywhere, or null when there is no term.
 */
function likePattern(term) {
  const text = String(term == null ? "" : term).trim();
  if (!text) return null;

  const escaped = text.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  return `%${escaped}%`;
}

module.exports = { likePattern };
