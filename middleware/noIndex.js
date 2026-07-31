/**
 * Keeps the public pages out of search results.
 */

"use strict";

/**
 * Ask search engines not to index this response or follow its links.
 */
function noIndex(req, res, next) {
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  next();
}

module.exports = { noIndex };
