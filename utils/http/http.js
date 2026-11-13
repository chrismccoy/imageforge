/**
 * HTTP helpers
 */

"use strict";

const JSON_PREFIXES = ["/api/"];

/**
 * Whether the caller wants a JSON reply instead of an HTML page: an /api/ URL,
 * a fetch carrying the CSRF header, or an Accept that prefers JSON.
 */
function wantsJson(req) {
  const url = String((req && (req.originalUrl || req.url)) || "");
  if (JSON_PREFIXES.some((prefix) => url.startsWith(prefix))) return true;

  if (req && typeof req.get === "function" && req.get("x-csrf-token")) {
    return true;
  }
  return Boolean(
    req &&
    typeof req.accepts === "function" &&
    req.accepts(["html", "json"]) === "json"
  );
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
