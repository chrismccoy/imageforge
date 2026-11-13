/**
 * Proxy configuration check
 *
 * TRUST_PROXY decides whether req.ip (used by the IP  and the rate limiters) is read from the X-Forwarded-For header.
 */

"use strict";

const { env } = require("../config/env");

/**
 * Whether the connection itself comes from this machine.
 */
function fromLoopback(req) {
  const peer = String((req.socket && req.socket.remoteAddress) || "");
  return peer === "::1" || /^(::ffff:)?127\./.test(peer);
}

/**
 * Build the proxy check middleware. Each problem is warned about once.
 */
function proxyCheck(warn = console.warn) {
  const warned = new Set();

  const once = (key, message) => {
    if (warned.has(key)) return;
    warned.add(key);
    warn(message);
  };

  return function (req, res, next) {
    const forwarded = Boolean(req.headers["x-forwarded-for"]);
    const local = fromLoopback(req);

    if (env.TRUST_PROXY && !forwarded && !local) {
      once(
        "spoofable",
        "[proxy] TRUST_PROXY is set but a request arrived without X-Forwarded-For. " +
          "If this app is not behind a trusted proxy, clients can spoof that " +
          "header to bypass the IP gate and login limiter. Unset TRUST_PROXY."
      );
    } else if (!env.TRUST_PROXY && forwarded && local) {
      once(
        "open",
        "[proxy] X-Forwarded-For seen from a local proxy but TRUST_PROXY is not set. " +
          "Every client appears as localhost, so the IP gate lets everyone in and " +
          "the rate limiters share one bucket. Set TRUST_PROXY=true."
      );
    } else if (!env.TRUST_PROXY && forwarded) {
      once(
        "collapsed",
        "[proxy] X-Forwarded-For seen but TRUST_PROXY is not set. If this app " +
          "is behind a proxy, every client collapses to the proxy IP and the " +
          "IP gate and rate limiters over-block. Set TRUST_PROXY=true."
      );
    }
    next();
  };
}

module.exports = { proxyCheck };
