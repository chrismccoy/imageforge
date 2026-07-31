/**
 * How full the uploads folder is
 */

"use strict";

const { readableBytes } = require("./format");

/**
 * The used figure, the quota, and the percentage between them.
 */
function storageFigures(usedBytes, quotaBytes) {
  return {
    used: readableBytes(usedBytes),
    quota: readableBytes(quotaBytes),
    percent: quotaBytes
      ? Math.min(100, Math.round((usedBytes / quotaBytes) * 100))
      : 100,
  };
}

module.exports = { storageFigures };
