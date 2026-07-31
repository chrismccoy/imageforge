/**
 * Zip helpers
 */

"use strict";

const fsp = require("fs/promises");

const { ZIP_COMPRESSION_LEVEL } = require("../../config/limits");
const { uploadPath } = require("./uploads");

/**
 * The rows that still have a file on disk, as zip entries.
 */
async function presentFiles(rows, dir) {
  const checked = await Promise.all(
    rows.map(async (row) => {
      const { safe, full } = uploadPath(row.filename, dir);
      try {
        await fsp.stat(full);
        return { name: safe, full };
      } catch (err) {
        if (err.code === "ENOENT") return null;
        throw err;
      }
    })
  );
  return checked.filter(Boolean);
}

/**
 * A new archive at the compression this app uses.
 */
async function createArchive() {
  const { ZipArchive } = await import("archiver");
  return new ZipArchive({ zlib: { level: ZIP_COMPRESSION_LEVEL } });
}

/**
 * Stream a zip of the given files.
 */
async function sendZip(res, files, filename, { log = console } = {}) {
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const archive = await createArchive();
  archive.on("error", (err) => {
    log.error("Zip error:", err.message);
    if (!res.headersSent) res.status(500).end();
    else res.destroy();
  });
  archive.pipe(res);
  files.forEach((file) => archive.file(file.full, { name: file.name }));
  archive.finalize();
}

module.exports = { presentFiles, createArchive, sendZip };
