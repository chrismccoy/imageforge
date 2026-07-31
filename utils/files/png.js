/**
 * PNG headers
 */

"use strict";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const HEADER_BYTES = 24;

/**
 * The dimensions of a PNG, or null if it is not one.
 */
function pngSize(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < HEADER_BYTES) return null;
  if (!buf.subarray(0, 8).equals(SIGNATURE)) return null;
  if (buf.toString("ascii", 12, 16) !== "IHDR") return null;

  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (!width || !height) return null;

  return { width, height };
}

module.exports = { pngSize };
