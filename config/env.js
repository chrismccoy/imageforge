/**
 * Environment
 */

"use strict";

const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { toTrimmedString } = require("../utils/domain/coerce");
const { parseKey } = require("../utils/security/encKey");
const { TOGGLES } = require("./toggles");

// Placeholder secret shipped for local development. Refused in production.
const DEFAULT_SESSION_SECRET = "image-forge-dev-secret";

/**
 * A positive number from the environment, or null when there is no usable one.
 */
function positive(raw) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Whether an environment variable says yes.
 */
function isTrue(raw) {
  return String(raw || "").toLowerCase() === "true";
}

const env = {
  PORT: Number(process.env.PORT) || 3000,
  SESSION_SECRET: process.env.SESSION_SECRET || DEFAULT_SESSION_SECRET,
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || "admin",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "",
  ALLOWED_IPS: String(process.env.ALLOWED_IPS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  TRUST_PROXY: isTrue(process.env.TRUST_PROXY),
  IS_PRODUCTION: process.env.NODE_ENV === "production",
  OPENAI_API_KEY: toTrimmedString(process.env.OPENAI_API_KEY),
  OPENAI_MODEL: toTrimmedString(process.env.OPENAI_MODEL),
  OPENAI_BASE_URL: toTrimmedString(process.env.OPENAI_BASE_URL),
  SETTINGS_ENC_KEY: toTrimmedString(process.env.SETTINGS_ENC_KEY),

  BRAND_NAME: toTrimmedString(process.env.BRAND_NAME),
  BRAND_ICON: toTrimmedString(process.env.BRAND_ICON),

  IMAGEFORGE_DB: toTrimmedString(process.env.IMAGEFORGE_DB),
  IMAGEFORGE_UPLOADS: toTrimmedString(process.env.IMAGEFORGE_UPLOADS),
  IMAGEFORGE_BACKUPS: toTrimmedString(process.env.IMAGEFORGE_BACKUPS),
  GENERATIONS_PER_PAGE: Number(process.env.GENERATIONS_PER_PAGE) || 0,
  ...Object.fromEntries(
    TOGGLES.map((toggle) => [toggle.env, isTrue(process.env[toggle.env])])
  ),

  UPLOAD_QUOTA_MB: positive(process.env.UPLOAD_QUOTA_MB),
  UPLOAD_MAX_MB: positive(process.env.UPLOAD_MAX_MB),
  EDIT_MAX_MB: positive(process.env.EDIT_MAX_MB),
  IMPORT_MAX_KB: positive(process.env.IMPORT_MAX_KB),
  RATE_LIMIT_LOGIN_MAX: positive(process.env.RATE_LIMIT_LOGIN_MAX),
  RATE_LIMIT_GENERATE_MAX: positive(process.env.RATE_LIMIT_GENERATE_MAX),
  RATE_LIMIT_SAVE_MAX: positive(process.env.RATE_LIMIT_SAVE_MAX),
  RATE_LIMIT_SHARE_MAX: positive(process.env.RATE_LIMIT_SHARE_MAX),
  RATE_LIMIT_SHARE_ZIP_MAX: positive(process.env.RATE_LIMIT_SHARE_ZIP_MAX),
};

/**
 * Fail on unsafe production configuration. Called once at startup.
 * Returns the list of problems found (empty when the config is safe).
 */
function configProblems() {
  const problems = [];

  // Validate the API key encryption key whenever it is set
  if (env.SETTINGS_ENC_KEY) {
    if (!parseKey(env.SETTINGS_ENC_KEY)) {
      problems.push(
        "SETTINGS_ENC_KEY must be 32 bytes, given as 64 hex chars or base64."
      );
    }
  }

  if (env.PUBLIC_GALLERY && !env.PUBLIC_SHARE) {
    problems.push(
      "PUBLIC_GALLERY requires PUBLIC_SHARE=true, otherwise the gallery's links and images are refused by the IP allow list."
    );
  }

  if (!env.IS_PRODUCTION) return problems;

  if (
    !process.env.SESSION_SECRET ||
    env.SESSION_SECRET === DEFAULT_SESSION_SECRET
  ) {
    problems.push(
      "SESSION_SECRET must be set to a unique random value in production."
    );
  }
  if (!env.ADMIN_PASSWORD) {
    problems.push("ADMIN_PASSWORD must be set in production.");
  }
  if (!env.SETTINGS_ENC_KEY) {
    problems.push(
      "SETTINGS_ENC_KEY must be set in production to encrypt the stored API key at rest."
    );
  }
  return problems;
}

/**
 * Throw if the production configuration is unsafe.
 */
function assertConfig() {
  const problems = configProblems();
  if (problems.length) {
    throw new Error(`Invalid configuration:\n- ${problems.join("\n- ")}`);
  }
}

module.exports = {
  env,
  DEFAULT_SESSION_SECRET,
  configProblems,
  assertConfig,
};
