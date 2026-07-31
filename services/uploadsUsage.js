/**
 * How much room the uploads folder has
 */

"use strict";

const { UPLOAD_DIR } = require("../config/paths");
const { UPLOAD_QUOTA_BYTES, UPLOADS_SCAN_MAX_AGE_MS } = require("../config/limits");
const { uploadsDirBytes } = require("../utils/files/uploads");

/**
 * Build the usage reader for one uploads folder.
 */
function createUploadsUsage({
  dir = UPLOAD_DIR,
  quotaBytes = UPLOAD_QUOTA_BYTES,
  maxAgeMs = UPLOADS_SCAN_MAX_AGE_MS,
} = {}) {
  let total = null;
  let readAt = 0;

  let queue = Promise.resolve();

  function alone(step) {
    const run = queue.then(step, step);
    queue = run.then(
      () => {},
      () => {}
    );
    return run;
  }

  async function bytes() {
    const stale = total === null || Date.now() - readAt > maxAgeMs;
    if (stale) {
      total = await uploadsDirBytes(dir);
      readAt = Date.now();
    }
    return total;
  }

  function forget() {
    total = null;
  }

  /**
   * Save something, if there is room for it.
   */
  function write(byteCount, save) {
    return alone(async () => {
      const used = await bytes();
      if (used + byteCount > quotaBytes) return false;

      await save();

      total = used + byteCount;
      return true;
    });
  }

  return { bytes, forget, write, quotaBytes };
}

function requireUsage(usage, who) {
  if (!usage) {
    throw new Error(`${who} needs deps.usage — see services/uploadsUsage.js`);
  }
  return usage;
}

module.exports = { createUploadsUsage, requireUsage };
