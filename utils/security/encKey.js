/**
 * The encryption key
 */

"use strict";

/**
 * Parse a raw SETTINGS_ENC_KEY into a 32-byte Buffer, or null.
 */
function parseKey(raw) {
  const value = String(raw == null ? "" : raw).trim();
  if (!value) return null;

  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return Buffer.from(value, "hex");
  }
  try {
    const buf = Buffer.from(value, "base64");
    if (buf.length === 32) return buf;
  } catch {
    /* fall through */
  }
  return null;
}

module.exports = { parseKey };
