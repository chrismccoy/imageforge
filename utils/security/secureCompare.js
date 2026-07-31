/**
 * Constant time compare
 */

"use strict";

const crypto = require("crypto");

/**
 * Compare two strings in constant time.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

module.exports = { safeEqual };
