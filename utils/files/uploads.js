/**
 * Upload paths
 */

"use strict";

const path = require("path");
const fsp = require("fs/promises");
const { UPLOAD_DIR } = require("../../config/paths");

/**
 * Where the uploads live
 */
function uploadsDirFor(folders = {}) {
  return folders.uploadDir || UPLOAD_DIR;
}

/**
 * Absolute path to a saved upload, kept inside the uploads folder. A name
 * that is no file at all is refused as not found.
 */
function uploadPath(filename, dir) {
  const safe = path.basename(String(filename || ""));
  if (safe === "" || safe === "." || safe === "..") {
    throw Object.assign(new Error("Not found."), { status: 404, expose: true });
  }
  return { safe, full: path.join(dir, safe) };
}

/**
 * Total bytes of the files directly in UPLOAD_DIR. A missing folder counts as
 * zero. Used to enforce a disk quota before saving a new upload.
 */
async function uploadsDirBytes(dir) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return 0;
    throw err;
  }

  let total = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    try {
      const { size } = await fsp.stat(path.join(dir, entry.name));
      total += size;
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }
  return total;
}

module.exports = { uploadsDirFor, uploadPath, uploadsDirBytes };
