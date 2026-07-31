/**
 * Security headers
 */

"use strict";

const { env } = require("../config/env");

const HSTS_MAX_AGE_SECONDS = 31536000;

const CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/**
 * Build the middleware that adds the security headers.
 */
function createSecurityHeaders({ settings = env } = {}) {
  const overTls = settings.IS_PRODUCTION || settings.TRUST_PROXY;

  return function securityHeaders(req, res, next) {
    res.setHeader("Content-Security-Policy", CSP);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "same-origin");

    if (overTls) {
      res.setHeader(
        "Strict-Transport-Security",
        `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains`
      );
    }
    next();
  };
}

module.exports = { createSecurityHeaders };
