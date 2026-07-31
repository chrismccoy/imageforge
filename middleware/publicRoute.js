/**
 * Public routes
 */

"use strict";

const { rateLimit } = require("./rateLimit");

const BUSY = "Too many requests. Try again later.";
const BUSY_ZIP = "Too many downloads. Try again later.";

/**
 * The gate for one public links
 */
function publicGate({ access, ipAllow }, toggle, { orAuth = null } = {}) {
  return function guard(req, res, next) {
    if (access[toggle](req.settings)) return next();

    return ipAllow(req, res, orAuth ? () => orAuth(req, res, next) : next);
  };
}

/**
 * A limiter for a public route.
 */
function publicLimiter(limits, message = BUSY) {
  return rateLimit({
    ...limits,
    message,
    html: (res, text) => res.status(429).type("text").send(text),
  });
}

/**
 * The pair of limiters
 */
function shareLimiters(rate) {
  return {
    limiter: publicLimiter(rate.share),
    zipLimiter: publicLimiter(rate.shareZip, BUSY_ZIP),
  };
}

module.exports = { publicGate, publicLimiter, shareLimiters, BUSY, BUSY_ZIP };
