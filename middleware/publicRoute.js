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

// A page shows many images, so the image and file routes get more room than the pages.
const IMAGES_PER_PAGE_VIEW = 10;

/**
 * The limits for the images behind the public pages.
 */
function imageRate(rate) {
  return (
    rate.shareImage || {
      windowMs: rate.share.windowMs,
      max: rate.share.max * IMAGES_PER_PAGE_VIEW,
    }
  );
}

/**
 * The limiter for the images and files behind the public pages.
 */
function imageLimiter(rate) {
  return publicLimiter(imageRate(rate));
}

/**
 * The page, image and zip limiters
 */
function shareLimiters(rate) {
  return {
    limiter: publicLimiter(rate.share),
    imageLimiter: imageLimiter(rate),
    zipLimiter: publicLimiter(rate.shareZip, BUSY_ZIP),
  };
}

module.exports = {
  publicGate,
  publicLimiter,
  imageLimiter,
  imageRate,
  shareLimiters,
  BUSY,
  BUSY_ZIP,
};
