/**
 * Expiring store tests
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createExpiringStore } = require("../../../services/expiringStore");

function store({ ttlMs = 60_000, max = 10 } = {}) {
  return createExpiringStore({ ttlMs, max });
}

test("what is added can be read back until it is taken", () => {
  const held = store();
  held.add("k", { n: 1 });

  assert.equal(held.get("k").value.n, 1, "reading does not spend it");
  assert.equal(held.get("k").value.n, 1);
  assert.equal(held.size, 1);

  held.close();
});

test("only one caller can take a key", () => {
  const held = store();
  held.add("k", { n: 1 });

  assert.equal(held.take("k").value.n, 1);
  assert.equal(held.take("k"), null, "the second caller gets nothing");
  assert.equal(held.get("k"), null);
  assert.equal(held.size, 0);

  held.close();
});

test("adding at the cap drops the oldest, taken or not", () => {
  const held = store({ max: 3 });
  held.add("first", 1);
  held.add("second", 2);
  held.add("third", 3);
  held.add("fourth", 4);

  assert.equal(held.get("first"), null, "the oldest made room");
  assert.equal(held.get("second").value, 2);
  assert.equal(held.get("fourth").value, 4);
  assert.equal(held.size, 3, "the ceiling holds");

  held.close();
});

test("an entry past its deadline is gone, and is dropped when read", async () => {
  const held = store({ ttlMs: 20 });
  held.add("k", { n: 1 });

  await new Promise((resolve) => setTimeout(resolve, 40));

  assert.equal(held.get("k"), null);
  assert.equal(held.size, 0, "reading a stale entry drops it");

  held.close();
});

test("putBack keeps the stated deadline and refuses a passed one", () => {
  const held = store();
  const soon = Date.now() + 5_000;

  assert.equal(held.putBack("k", { n: 1 }, soon), true);
  assert.equal(held.get("k").expiresAt, soon, "not extended");

  assert.equal(held.putBack("gone", { n: 2 }, Date.now() - 1), false);
  assert.equal(held.get("gone"), null, "nothing was stored");

  held.close();
});

test("putBack does not make room", () => {
  const held = store({ max: 2 });
  held.add("a", 1);
  held.add("b", 2);

  held.putBack("c", 3, Date.now() + 5_000);

  assert.equal(held.get("a").value, 1, "nothing was dropped for it");
  assert.equal(held.get("c").value, 3);
  assert.equal(held.size, 3);

  held.close();
});

test("a missing key is null rather than undefined", () => {
  const held = store();

  assert.equal(held.get("nope"), null);
  assert.equal(held.take("nope"), null);

  held.close();
});
