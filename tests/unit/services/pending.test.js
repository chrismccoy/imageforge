/**
 * Pending image store tests
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createPendingImages } = require("../../../services/pendingImages");

test("put then claim returns the bytes and metadata once", () => {
  const store = createPendingImages();
  const bytes = Buffer.from("hello");
  const token = store.put(bytes, {
    prompt: "p",
    size: "1024x1024",
    model: "gpt-image-1.5",
  });

  const first = store.claim(token);
  assert.ok(first);
  assert.equal(first.bytes.toString(), "hello");
  assert.equal(first.meta.prompt, "p");

  assert.equal(store.claim(token), null, "a token can only be claimed once");
  store.close();
});

test("claiming an unknown token is null", () => {
  const store = createPendingImages();
  assert.equal(store.claim("nope"), null);
  assert.equal(store.claim(undefined), null);
  store.close();
});

test("the store is capped and drops the oldest entries", () => {
  const store = createPendingImages({ max: 3 });
  const tokens = [];
  for (let i = 0; i < 5; i += 1) {
    tokens.push(store.put(Buffer.from(String(i)), { prompt: String(i) }));
  }
  assert.equal(store.size, 3, "never holds more than the cap");
  assert.equal(store.claim(tokens[0]), null, "oldest was evicted");
  assert.equal(store.claim(tokens[1]), null, "second oldest was evicted");
  assert.ok(store.claim(tokens[4]), "newest survives");
  store.close();
});

test("a claimed image can be handed back, and only once it is", () => {
  const store = createPendingImages();
  const token = store.put(Buffer.from("hello"), { prompt: "p" });

  const claimed = store.claim(token);
  assert.equal(store.peek(token), null, "gone while the caller holds it");

  assert.equal(store.restore(token, claimed), true);
  assert.equal(store.peek(token).bytes.toString(), "hello", "and back again");
  assert.equal(store.claim(token).meta.prompt, "p", "saveable a second time");

  store.close();
});

test("restoring keeps the original deadline rather than extending it", () => {
  const store = createPendingImages({ ttlMs: 50 });
  const token = store.put(Buffer.from("hello"), { prompt: "p" });

  const claimed = store.claim(token);
  claimed.expiresAt = Date.now() - 1;
  assert.equal(store.restore(token, claimed), false);
  assert.equal(store.peek(token), null);

  store.close();
});

test("the token rules hold against a stand-in store", () => {
  const kept = new Map();
  const stub = {
    get: (key) => kept.get(key) || null,
    add: (key, value) => kept.set(key, { value, expiresAt: Date.now() + 1000 }),
    putBack: (key, value, expiresAt) => {
      if (!(expiresAt > Date.now())) return false;
      kept.set(key, { value, expiresAt });
      return true;
    },
    take: (key) => {
      const held = kept.get(key) || null;
      kept.delete(key);
      return held;
    },
    close: () => {},
    get size() {
      return kept.size;
    },
  };

  const store = createPendingImages({ store: stub });
  const token = store.put(Buffer.from("bytes"), { prompt: "p" });

  assert.equal(store.peek(token).meta.prompt, "p", "peek does not spend it");

  const claimed = store.claim(token);
  assert.equal(claimed.meta.prompt, "p");
  assert.equal(store.claim(token), null, "a token is good for one save");

  assert.equal(store.restore(token, claimed), true);
  assert.equal(store.claim(token).meta.prompt, "p", "saveable again");
});
