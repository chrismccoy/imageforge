/**
 * CSRF protection
 */

"use strict";

const crypto = require("crypto");
const { respond } = require("../utils/http/http");
const { denied } = require("../utils/http/pages");
const { safeEqual } = require("../utils/security/secureCompare");

const CSRF_TOKEN_BYTES = 32;

/**
 * Whether the request carries the session's CSRF token, in the body or header.
 */
function tokenOk(req) {
  const expected = req.session && req.session.csrfToken;
  const sent = String(
    (req.body && req.body._csrf) || req.get("x-csrf-token") || ""
  );
  return Boolean(expected) && safeEqual(sent, expected);
}

/**
 * Refuse a request that does not carry the session's CSRF token.
 */
function requireCsrf(req, res, next) {
  if (tokenOk(req)) return next();

  return respond(req, res, {
    status: 403,
    message: "Invalid or missing CSRF token.",
    html: () => denied(res),
  });
}

/**
 * A path as Express matches it: case-insensitive, trailing slash optional.
 */
function routeKey(path) {
  return (
    String(path || "")
      .toLowerCase()
      .replace(/\/+$/, "") || "/"
  );
}

/**
 * Build the CSRF middleware. A multipart POST to one of `multipartPaths` is
 * let through unchecked, because its parser runs requireCsrf on the body.
 */
function createCsrf({ multipartPaths = [] } = {}) {
  const deferred = new Set(multipartPaths.map(routeKey));

  return function csrf(req, res, next) {
    if (!req.session.csrfToken) {
      req.session.csrfToken = crypto.randomBytes(CSRF_TOKEN_BYTES).toString("hex");
    }
    res.locals.csrfToken = req.session.csrfToken;

    const method = req.method.toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      return next();
    }

    if (tokenOk(req)) return next();

    const contentType = req.get("content-type") || "";
    if (
      method === "POST" &&
      contentType.startsWith("multipart/form-data") &&
      deferred.has(routeKey(req.path))
    ) {
      return next();
    }

    return respond(req, res, {
      status: 403,
      message: "Invalid or missing CSRF token.",
      html: () => denied(res),
    });
  };
}

const csrf = createCsrf();

module.exports = { csrf, createCsrf, requireCsrf };
