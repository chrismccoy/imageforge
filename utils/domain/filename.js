/**
 * Image file names
 *
 * Builds the name for a saved image, for example "image-forge-20260731021546-93c031.png".
 */

"use strict";

const crypto = require("crypto");

const TIMESTAMP_DIGITS = 14;
const RANDOM_BYTES = 3;

/**
 * Build a unique file name from the current time and a short random suffix.
 * The extension defaults to png; uploads pass their own (jpg, webp).
 */
function generatedImageName(ext = "png") {
  const stamp = new Date()
    .toISOString()
    .replace(/\D/g, "")
    .slice(0, TIMESTAMP_DIGITS);
  const rand = crypto.randomBytes(RANDOM_BYTES).toString("hex");
  const clean =
    String(ext)
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase() || "png";
  return `image-forge-${stamp}-${rand}.${clean}`;
}

module.exports = { generatedImageName };
