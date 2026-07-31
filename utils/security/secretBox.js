/**
 * Secret box
 *
 * Encrypts the stored OpenAI API key at rest with AES-256-GCM.
 */

"use strict";

const crypto = require("crypto");

const { env } = require("../../config/env");
const { parseKey } = require("./encKey");

const PREFIX = "enc:v1:";
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * The active key, or null when none is configured.
 */
function envKey() {
  return parseKey(env.SETTINGS_ENC_KEY);
}

/**
 * A box bound to one key, for callers that supply their own.
 */
function withKey(rawKey) {
  const key = parseKey(rawKey);
  return {
    available: () => available(key),
    isEncrypted,
    encrypt: (plaintext) => encrypt(plaintext, key),
    decrypt: (stored) => decrypt(stored, key),
  };
}

/**
 * Whether encryption is available (a valid key is configured).
 */
function available(key = envKey()) {
  return Boolean(key);
}

/**
 * Whether a stored value is one of our encrypted blobs.
 */
function isEncrypted(stored) {
  return typeof stored === "string" && stored.startsWith(PREFIX);
}

/**
 * Encrypt plaintext into the stored format. Throws if no key is configured.
 */
function encrypt(plaintext, key = envKey()) {
  if (!key) throw new Error("SETTINGS_ENC_KEY is not configured.");
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([
    cipher.update(String(plaintext), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString("base64");
}

/**
 * Decrypt a stored blob back to plaintext.
 */
function decrypt(stored, key = envKey()) {
  if (!key) throw new Error("SETTINGS_ENC_KEY is not configured.");
  if (!isEncrypted(stored)) throw new Error("Not an encrypted value.");

  const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ct = raw.subarray(IV_BYTES + TAG_BYTES);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

module.exports = {
  parseKey,
  envKey,
  withKey,
  available,
  isEncrypted,
  encrypt,
  decrypt,
  PREFIX,
};
