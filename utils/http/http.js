/**
 * HTTP helpers
 */

"use strict";

const JSON_PREFIXES = ["/api/"];

/**
 * Whether the caller wants a JSON reply instead of an HTML page.
 */
function wantsJson(req) {
  const url = String((req && (req.originalUrl || req.url)) || "");
  return JSON_PREFIXES.some((prefix) => url.startsWith(prefix));
}

/**
 * Reply in the format the request wants
 */
function respond(req, res, { status = 200, message, html }) {
  if (wantsJson(req)) {
    return problem(res, status, message);
  }
  return html(res);
}

/**
 * Refuse in JSON, whatever the URL says.
 */
function problem(res, status, message) {
  return res.status(status).json({ message });
}

const INSUFFICIENT_STORAGE = 507;

module.exports = { wantsJson, respond, problem, INSUFFICIENT_STORAGE };
