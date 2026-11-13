/**
 * Where a request thinks it is
 */

"use strict";

/**
 * The host a request came in on. Express's req.host reads X-Forwarded-Host only under trust proxy.
 */
function hostOf(req) {
  if (!req) return "";
  if (req.host) return req.host;
  return typeof req.get === "function" ? req.get("host") : "";
}

/**
 * The scheme and host a request came in on, or an empty string.
 */
function originOf(req) {
  const host = hostOf(req);
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
