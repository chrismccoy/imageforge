/**
 * Reading an archive
 */

"use strict";

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { on } = require("events");
const { pipeline } = require("stream/promises");

const yauzl = require("yauzl");

const GB = 1024 * 1024 * 1024;
const MANIFEST_MAX_BYTES = 1024 * 1024;
const EXTRACT_LIMITS = { maxEntries: 100000, maxBytes: 64 * GB };

/**
 * Open a zip, or say plainly that it is not one.
 */
function openZip(zipPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err && err.code) return reject(err);
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
async function readEntry(zip, wanted, { maxBytes = Infinity } = {}) {
  for await (const entry of entriesOf(zip)) {
    if (entry.fileName !== wanted) continue;
    if (entry.uncompressedSize > maxBytes) {
      throw new Error(`${wanted} is too large to be read.`);
    }
    return bytesOf(zip, entry);
  }
  return null;
}

/**
 * The manifest inside an archive.
 */
async function readManifest(zipPath) {
  const zip = await openZip(zipPath);
  let bytes;
  try {
    bytes = await readEntry(zip, "manifest.json", {
      maxBytes: MANIFEST_MAX_BYTES,
    });
  } finally {
    zip.close();
  }
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
 * Write one entry's bytes to a path, leaving no partial file on failure.
 */
async function writeEntry(zip, entry, target) {
  const stream = await new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, s) => (err ? reject(err) : resolve(s)));
  });
  try {
    await pipeline(stream, fs.createWriteStream(target));
  } catch (err) {
    await fsp.rm(target, { force: true });
    throw err;
  }
}

/**
 * Refuse an archive too big to unpack here.
 */
async function checkSize(zip, root, { maxEntries, maxBytes }) {
  if (zip.entryCount > maxEntries) {
    throw new Error(`The archive holds more than ${maxEntries} entries.`);
  }
  let total = 0;
  for await (const entry of entriesOf(zip)) {
    total += entry.uncompressedSize;
    if (total > maxBytes) {
      throw new Error("The archive unpacks to more than this allows.");
    }
  }
  const { bavail, bsize } = await fsp.statfs(root);
  if (total > bavail * bsize) {
    throw new Error("There is not enough free disk space to unpack it.");
  }
}

/**
 * Unpack an archive into a directory.
 */
async function extractTo(zipPath, dir, limits = {}) {
  const root = path.resolve(dir);
  await fsp.mkdir(root, { recursive: true });

  const sizing = await openZip(zipPath);
  try {
    await checkSize(sizing, root, { ...EXTRACT_LIMITS, ...limits });
  } finally {
    sizing.close();
  }

  const zip = await openZip(zipPath);
  try {
    await unpack(zip, root);
  } finally {
    zip.close();
  }

  return {
    dbPath: path.join(root, "database.sqlite"),
    uploadDir: path.join(root, "uploads"),
  };
}

/**
 * Write every entry of an open archive under root.
 */
async function unpack(zip, root) {
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
}

module.exports = { openZip, readEntry, readManifest, extractTo };
