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
  // Bumped whenever the folder changes, so a scan begun before it is not kept.
  let generation = 0;
  let scan = null;

  let queue = Promise.resolve();

  function alone(step) {
    const run = queue.then(step, step);
    queue = run.then(
      () => {},
      () => {}
    );
    return run;
  }

  /**
   * The folder's size, scanning again when the cached one is old or forgotten.
   * Callers at the same moment share one scan.
   */
  async function bytes() {
    const stale = total === null || Date.now() - readAt > maxAgeMs;
    if (!stale) return total;

    if (!scan || scan.generation !== generation) {
      const started = { generation };
      started.done = uploadsDirBytes(dir)
        .then((found) => {
          if (started.generation === generation) {
            total = found;
            readAt = Date.now();
          }
          return found;
        })
        .finally(() => {
          if (scan === started) scan = null;
        });
      scan = started;
    }
    return scan.done;
  }

  function forget() {
    generation += 1;
    total = null;
  }

  /**
   * Save something, if there is room for it.
   */
  function write(byteCount, save) {
    return alone(async () => {
      const before = generation;
      const used = await bytes();
      if (used + byteCount > quotaBytes) return false;

      await save();

      const moved = generation !== before;
      generation += 1;
      total = moved ? null : used + byteCount;
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
