/**
 * Backups on disk
 */

"use strict";

const fs = require("fs");
const path = require("path");

const { BACKUP_DIR } = require("../../config/paths");
const { readableBytes } = require("../domain/format");

const TO_THE_SECOND = 19;

/**
 * A filename that sorts by when it was taken.
 */
function backupName(now) {
  const stamp = now
    .toISOString()
    .slice(0, TO_THE_SECOND)
    .replace(/[-:]/g, "")
    .replace("T", "-");
  return `imageforge-${stamp}.zip`;
}

/**
 * The full path of a named backup, or null.
 */
function backupPath(dir, name) {
  const safe = path.basename(String(name || ""));
  if (!safe.endsWith(".zip") || safe.startsWith(".")) return null;

  const root = path.resolve(dir);
  const full = path.resolve(root, safe);
  if (full !== path.join(root, safe)) return null;

  return { safe, full };
}

/**
 * Every archive in the folder, newest first.
 */
function listBackups(dir) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }

  return names
    .filter((name) => name.endsWith(".zip"))
    .map((name) => {
      const stat = fs.statSync(path.join(dir, name));
      return {
        name,
        bytes: stat.size,
        size: readableBytes(stat.size),
        createdAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

module.exports = { BACKUP_DIR, backupName, backupPath, listBackups };
