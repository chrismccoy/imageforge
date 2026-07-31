/**
 * File paths
 */

"use strict";

const path = require("path");

const { env } = require("./env");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = env.IMAGEFORGE_DB || path.join(DATA_DIR, "imageforge.db");
const PUBLIC_DIR = path.join(ROOT, "public");
const UPLOAD_DIR = env.IMAGEFORGE_UPLOADS || path.join(PUBLIC_DIR, "uploads");
const BACKUP_DIR = env.IMAGEFORGE_BACKUPS || path.join(DATA_DIR, "backups");
const CSS_DIR = path.join(PUBLIC_DIR, "css");
const JS_DIR = path.join(PUBLIC_DIR, "js");
const VENDOR_DIR = path.join(PUBLIC_DIR, "vendor");
const SCREENSHOTS_DIR = path.join(ROOT, "screenshots");

module.exports = {
  ROOT,
  DATA_DIR,
  DB_PATH,
  BACKUP_DIR,
  PUBLIC_DIR,
  UPLOAD_DIR,
  CSS_DIR,
  JS_DIR,
  VENDOR_DIR,
  SCREENSHOTS_DIR,
};
