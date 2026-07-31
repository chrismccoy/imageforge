/**
 * Image type checking
 */

"use strict";

const PNG = { ext: "png", mime: "image/png" };
const JPEG = { ext: "jpg", mime: "image/jpeg" };
const WEBP = { ext: "webp", mime: "image/webp" };

const ACCEPTED = [PNG, JPEG, WEBP];
const ACCEPTED_MIME = ACCEPTED.map((kind) => kind.mime);
const ACCEPTED_EXT = ACCEPTED.map((kind) => kind.ext);

/**
 * Look at the leading bytes and return { ext, mime } for a known image
 */
function sniffImageType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;

  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return PNG;
  }

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return JPEG;
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return WEBP;
  }

  return null;
}

module.exports = { sniffImageType, ACCEPTED_MIME, ACCEPTED_EXT };
