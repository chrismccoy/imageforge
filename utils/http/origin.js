/**
 * Where a request thinks it is
 */

"use strict";

/**
 * The scheme and host a request came in on, or an empty string.
 */
function originOf(req) {
  const host = req && typeof req.get === "function" ? req.get("host") : "";
  if (!host) return "";

  return `${req.protocol || "http"}://${host}`;
}

/**
 * One of the app's own paths as an absolute URL, or an empty string.
 */
function absoluteUrl(req, path) {
  const origin = originOf(req);
  if (!origin || !path) return "";

  return `${origin}${path}`;
}

module.exports = { originOf, absoluteUrl };
