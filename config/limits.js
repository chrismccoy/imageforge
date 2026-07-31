/**
 * Limits
 *
 * Body sizes, timeouts, and the per IP requests.
 */

"use strict";

const { env } = require("./env");

const JSON_BODY_LIMIT = "1mb";
const ZIP_COMPRESSION_LEVEL = 9;

// How long a browser may hold an image served behind a share token.
const PUBLIC_IMAGE_CACHE = { "Cache-Control": "public, max-age=300" };

// An image behind the login is never cached
const PRIVATE_IMAGE_CACHE = {
  "Cache-Control": "private, max-age=0, must-revalidate",
};

// How many saved images the generations page shows per page.
const DEFAULT_PAGE_SIZE = 24;
const MIN_PAGE_SIZE = 1;
const MAX_PAGE_SIZE = 100;

const UPLOADS_SCAN_MAX_AGE_MS = 60 * 1000;

const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const SESSION_SWEEP_MS = 1000 * 60 * 15; // clear expired sessions every 15 min

// Freshly generated images wait in memory until the user saves them.
const PENDING_TTL_MS = 1000 * 60 * 10; // a preview is saveable for 10 min

const PENDING_MAX = 20;

const MB = 1024 * 1024;
const KB = 1024;

// Ceiling on the total size of public/uploads/ so saving cannot fill up space.
const UPLOAD_QUOTA_BYTES = (env.UPLOAD_QUOTA_MB || 500) * MB;

// Largest single manual upload accepted on the Upload page.
const UPLOAD_MAX_BYTES = (env.UPLOAD_MAX_MB || 10) * MB;

// How many images one post to the Upload page may carry. A cap rather than none
const UPLOAD_MAX_FILES = 10;

// A source PNG plus its mask, both at the largest size the app offers.
const EDIT_MAX_BYTES = (env.EDIT_MAX_MB || 12) * MB;

// A prompts export is a few kilobytes, so this is generous
const IMPORT_MAX_BYTES = (env.IMPORT_MAX_KB || 1024) * KB;

const MINUTE = 60 * 1000;

// Requests per client IP. The windows are fixed
const RATE_LIMITS = {
  login: { windowMs: 15 * MINUTE, max: env.RATE_LIMIT_LOGIN_MAX || 10 },
  generate: { windowMs: MINUTE, max: env.RATE_LIMIT_GENERATE_MAX || 30 },
  save: { windowMs: MINUTE, max: env.RATE_LIMIT_SAVE_MAX || 60 },
  share: { windowMs: MINUTE, max: env.RATE_LIMIT_SHARE_MAX || 60 },
  shareZip: { windowMs: MINUTE, max: env.RATE_LIMIT_SHARE_ZIP_MAX || 5 },
};

const LIMITS = {
  rate: RATE_LIMITS,
  uploadMaxBytes: UPLOAD_MAX_BYTES,
  uploadMaxFiles: UPLOAD_MAX_FILES,
  editMaxBytes: EDIT_MAX_BYTES,
  importMaxBytes: IMPORT_MAX_BYTES,
};

/**
 * The limits an app runs under: the defaults above, with anything stated.
 */
function resolveLimits(overrides = {}) {
  return {
    ...LIMITS,
    ...overrides,
    rate: { ...LIMITS.rate, ...(overrides.rate || {}) },
  };
}

module.exports = {
  LIMITS,
  resolveLimits,
  JSON_BODY_LIMIT,
  ZIP_COMPRESSION_LEVEL,
  PUBLIC_IMAGE_CACHE,
  PRIVATE_IMAGE_CACHE,
  DEFAULT_PAGE_SIZE,
  MIN_PAGE_SIZE,
  MAX_PAGE_SIZE,
  UPLOADS_SCAN_MAX_AGE_MS,
  SESSION_MAX_AGE_MS,
  SESSION_SWEEP_MS,
  PENDING_TTL_MS,
  PENDING_MAX,
  UPLOAD_QUOTA_BYTES,
  UPLOAD_MAX_BYTES,
  UPLOAD_MAX_FILES,
  EDIT_MAX_BYTES,
  IMPORT_MAX_BYTES,
  RATE_LIMITS,
};
