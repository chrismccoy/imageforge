/**
 * A store for expiring
 */

"use strict";

/**
 * Build a store.
 */
function createExpiringStore({ ttlMs, max }) {
  if (!Number.isInteger(max) || max < 1) {
    throw new Error("createExpiringStore needs a max of at least 1.");
  }
  const items = new Map();

  /**
   * Drop everything past its deadline.
   */
  function sweep() {
    const now = Date.now();
    for (const [key, item] of items) {
      if (item.expiresAt <= now) items.delete(key);
    }
  }

  /**
   * What is held under a key, or null when nothing usable is.
   */
  function get(key) {
    const item = items.get(key);
    if (!item) return null;

    if (item.expiresAt <= Date.now()) {
      items.delete(key);
      return null;
    }
    return { value: item.value, expiresAt: item.expiresAt };
  }

  /**
   * Drop the oldest entries until one more fits, unless the key is held.
   */
  function makeRoom(key) {
    sweep();
    if (items.has(key)) return;
    while (items.size >= max) {
      items.delete(items.keys().next().value);
    }
  }

  /**
   * Store a value with a fresh deadline, making room if the store is full.
   */
  function add(key, value) {
    makeRoom(key);
    items.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /**
   * Store a value with the deadline it already had, making room the same way.
   */
  function putBack(key, value, expiresAt) {
    if (!(expiresAt > Date.now())) return false;

    makeRoom(key);
    items.set(key, { value, expiresAt });
    return true;
  }

  /**
   * Take what is held under a key
   */
  function take(key) {
    const held = get(key);
    if (held) items.delete(key);
    return held;
  }

  const timer = setInterval(sweep, ttlMs);
  if (timer.unref) timer.unref();

  function close() {
    clearInterval(timer);
  }

  return {
    get,
    add,
    putBack,
    take,
    close,
    get size() {
      return items.size;
    },
  };
}

module.exports = { createExpiringStore };
