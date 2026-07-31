/**
 * Proxy configuration check
 *
 * TRUST_PROXY decides whether req.ip (used by the IP  and the rate limiters) is read from the X-Forwarded-For header.
 */

"use strict";

const { env } = require("../config/env");

/**
 * Build the proxy check middleware.
 */
function proxyCheck(warn = console.warn) {
  let checked = false;

  return function (req, res, next) {
    if (!checked) {
      checked = true;
      const forwarded = Boolean(req.headers["x-forwarded-for"]);

      if (env.TRUST_PROXY && !forwarded) {
        warn(
          "[proxy] TRUST_PROXY=true but no X-Forwarded-For on the first request. " +
            "If this app is not behind a trusted proxy, clients can spoof that " +
            "header to bypass the IP gate and login limiter. Unset TRUST_PROXY."
        );
      } else if (!env.TRUST_PROXY && forwarded) {
        warn(
          "[proxy] X-Forwarded-For seen but TRUST_PROXY is not set. If this app " +
            "is behind a proxy, every client collapses to the proxy IP and the " +
            "IP gate and rate limiters over-block. Set TRUST_PROXY=true."
        );
      }
    }
    next();
  };
}

module.exports = { proxyCheck };
