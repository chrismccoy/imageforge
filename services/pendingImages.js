/**
 * Pending images
 */

"use strict";

const crypto = require("crypto");
const { PENDING_TTL_MS, PENDING_MAX } = require("../config/limits");
const { createExpiringStore } = require("./expiringStore");

const TOKEN_BYTES = 16;

/**
 * Build a pending image store.
 */
function createPendingImages({
  ttlMs = PENDING_TTL_MS,
  max = PENDING_MAX,
  store = createExpiringStore({ ttlMs, max }),
} = {}) {
  /**
   * A token as the store keys by it.
   */
  function key(token) {
    return String(token || "");
  }

  function held(entry) {
    if (!entry) return null;
    return {
      bytes: entry.value.bytes,
      meta: entry.value.meta,
      expiresAt: entry.expiresAt,
    };
  }

  /**
   * Store image bytes with their metadata and return a token.
   */
  function put(bytes, meta) {
    const token = crypto.randomBytes(TOKEN_BYTES).toString("hex");
    store.add(token, { bytes, meta });
    return token;
  }

  function peek(token) {
    return held(store.get(key(token)));
  }

  /**
   * Take a stored image, or null if it is missing, expired, or already taken.
   */
  function claim(token) {
    return held(store.take(key(token)));
  }

  function restore(token, item) {
    if (!item) return false;

    return store.putBack(
      key(token),
      { bytes: item.bytes, meta: item.meta },
      item.expiresAt
    );
  }

  /**
   * Swap the bytes of a held image
   */
  function replace(token, bytes) {
    const at = key(token);
    const entry = store.get(at);
    if (!entry || !bytes || !bytes.length) return false;

    return store.putBack(at, { bytes, meta: entry.value.meta }, entry.expiresAt);
  }

  return {
    put,
    peek,
    claim,
    restore,
    replace,
    close: store.close,
    get size() {
      return store.size;
    },
  };
}

module.exports = { createPendingImages };
