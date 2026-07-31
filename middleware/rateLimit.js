/**
 * Rate limiter
 *
 * Counts requests per client IP in a fixed window, kept in memory.
 */

"use strict";

const { respond } = require("../utils/http/http");
const { VIEWS } = require("../config/views");

/**
 * What a request is counted against. The client IP unless told otherwise, so a
 * limiter can be keyed by something else, a share token, an account, etc
 */
const byIp = (req) => req.ip;

/**
 * One, unless a limiter says otherwise.
 */
const onePerRequest = () => 1;

/**
 * Build a rate limit middleware for a time limit and count.
 */
function rateLimit({
  windowMs,
  max,
  message,
  html,
  key = byIp,
  cost = onePerRequest,
}) {
  const hits = new Map();
  let lastSweep = Date.now();

  /**
   * Drop expired entries
   */
  function sweep(now) {
    if (now - lastSweep < windowMs) return;
    for (const [bucket, entry] of hits) {
      if (now >= entry.resetAt) hits.delete(bucket);
    }
    lastSweep = now;
  }

  return function (req, res, next) {
    const now = Date.now();
    sweep(now);

    const bucket = key(req);
    let entry = hits.get(bucket);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(bucket, entry);
    }
    entry.count += Math.max(1, Math.floor(cost(req)) || 1);

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      const text = message || "Too many requests. Try again later.";
      return respond(req, res, {
        status: 429,
        message: text,
        html: html
          ? () => html(res, text)
          : () =>
              res.status(429).render(VIEWS.LOGIN, { title: "Log in", error: text }),
      });
    }

    next();
  };
}

module.exports = { rateLimit };
