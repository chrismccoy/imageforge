/**
 * Reading an archive
 */

"use strict";

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { on } = require("events");

const yauzl = require("yauzl");

/**
 * Open a zip, or say plainly that it is not one.
 */
function openZip(zipPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err) {
        return reject(new Error(`${path.basename(zipPath)} is not a zip archive.`));
      }
      resolve(zip);
    });
  });
}

/**
 * One entry's bytes, held in memory.
 */
function bytesOf(zip, entry) {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => {
      if (err) return reject(err);
      const chunks = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });
  });
}

/**
 * One named entry's bytes, or null when the archive has no entry.
 */
async function readEntry(zip, wanted) {
  for await (const entry of entriesOf(zip)) {
    if (entry.fileName === wanted) return bytesOf(zip, entry);
  }
  return null;
}

/**
 * The manifest inside an archive.
 */
async function readManifest(zipPath) {
  const zip = await openZip(zipPath);
  const bytes = await readEntry(zip, "manifest.json");
  if (!bytes) {
    throw new Error(
      `${path.basename(zipPath)} has no manifest.json, so it is not an Image Forge archive.`
    );
  }
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (err) {
    throw new Error(`The manifest in ${path.basename(zipPath)} is not readable.`);
  }
}

/**
 * The archive's entries, one at a time.
 */
async function* entriesOf(zip) {
  const ended = new AbortController();
  zip.on("end", () => ended.abort());
  zip.readEntry();

  try {
    for await (const [entry] of on(zip, "entry", { signal: ended.signal })) {
      yield entry;
      zip.readEntry();
    }
  } catch (err) {
    if (err.name !== "AbortError") throw err;
  }
}

/**
 * Write one entry's bytes to a path.
 */
function writeEntry(zip, entry, target) {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => {
      if (err) return reject(err);

      const out = fs.createWriteStream(target);
      stream.on("error", reject);
      out.on("error", reject);
      out.on("close", resolve);
      stream.pipe(out);
    });
  });
}

/**
 * Unpack an archive into a directory.
 */
async function extractTo(zipPath, dir) {
  const root = path.resolve(dir);
  await fsp.mkdir(root, { recursive: true });

  const zip = await openZip(zipPath);

  for await (const entry of entriesOf(zip)) {
    const target = path.resolve(root, entry.fileName);
    if (target !== root && !target.startsWith(root + path.sep)) {
      throw new Error(
        `${entry.fileName} points outside the folder it unpacks into.`
      );
    }

    if (entry.fileName.endsWith("/")) {
      await fsp.mkdir(target, { recursive: true });
      continue;
    }

    await fsp.mkdir(path.dirname(target), { recursive: true });
    await writeEntry(zip, entry, target);
  }

  return {
    dbPath: path.join(root, "database.sqlite"),
    uploadDir: path.join(root, "uploads"),
  };
}

module.exports = { openZip, readEntry, readManifest, extractTo };
