/**
 * Slugs
 *
 * The readable part of a share URL. Built from the prompt and never stored
 */

"use strict";

const SLUG_MAX = 24;

/**
 * Turn a prompt into a URL-safe slug, or an empty string when nothing usable is left.
 */
function slugify(text) {
  const base = String(text || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (base.length <= SLUG_MAX) return base;

  const window = base.slice(0, SLUG_MAX + 1);
  const lastBreak = window.lastIndexOf("-");
  const cut = lastBreak > 0 ? window.slice(0, lastBreak) : base.slice(0, SLUG_MAX);

  return cut.replace(/-+$/, "");
}

module.exports = { slugify, SLUG_MAX };
