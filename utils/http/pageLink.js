/**
 * Paging links
 */

"use strict";

// The only keys a generated link may carry.
const LINK_KEYS = ["q", "fav", "sort", "category", "collection", "prompt", "view"];

/**
 * The query string for a set of criteria, or an empty string for none.
 */
function queryString(query) {
  const params = new URLSearchParams();

  for (const key of LINK_KEYS) {
    const value = query ? query[key] : undefined;
    if (value === undefined || value === null || String(value) === "") continue;
    params.set(key, String(value));
  }

  const text = params.toString();
  return text ? `?${text}` : "";
}

/**
 * The URL for one page of a list, carrying the current criteria.
 */
function pageLink(basePath, page, query) {
  const n = Math.floor(Number(page));
  const href = Number.isFinite(n) && n > 1 ? `${basePath}/page/${n}` : basePath;
  return `${href}${queryString(query)}`;
}

module.exports = { pageLink, LINK_KEYS };
