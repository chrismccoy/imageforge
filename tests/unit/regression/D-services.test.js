/**
 * Regression: usage, cost and the expiring store (group D)
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");

const uploads = require("../../../utils/files/uploads");
const { formatCost } = require("../../../utils/domain/cost");
const { createExpiringStore } = require("../../../services/expiringStore");

/**
 * Load uploadsUsage over a scanner the test resolves by hand.
 */
function usageWithScanner() {
  const scans = [];
  const real = uploads.uploadsDirBytes;
  uploads.uploadsDirBytes = () => new Promise((resolve) => scans.push({ resolve }));

  const file = require.resolve("../../../services/uploadsUsage");
  delete require.cache[file];
  try {
    const { createUploadsUsage } = require(file);
    return {
      usage: createUploadsUsage({ dir: "/unused", quotaBytes: 1000 }),
      scans,
    };
  } finally {
    uploads.uploadsDirBytes = real;
    delete require.cache[file];
  }
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test("a scan begun before forget() is not cached", async () => {
  const { usage, scans } = usageWithScanner();

  const early = usage.bytes();
  await tick();
  usage.forget();
  scans[0].resolve(500);
  assert.equal(await early, 500);

  const later = usage.bytes();
  await tick();
  assert.equal(scans.length, 2, "the stale result was dropped, so it scans again");
  scans[1].resolve(100);
  assert.equal(await later, 100);
});

test("callers at the same moment share one scan", async () => {
  const { usage, scans } = usageWithScanner();

  const one = usage.bytes();
  const two = usage.bytes();
  await tick();
  assert.equal(scans.length, 1);
  scans[0].resolve(42);
  assert.deepEqual(await Promise.all([one, two]), [42, 42]);
});

test("a scan begun before a write finished does not overwrite its total", async () => {
  const { usage, scans } = usageWithScanner();

  const early = usage.bytes();
  await tick();
  let finishSave;
  const saved = usage.write(50, () => new Promise((r) => (finishSave = r)));
  await tick();

  scans[scans.length - 1].resolve(100);
  await tick();
  finishSave();
  assert.equal(await saved, true);

  scans.forEach((scan) => scan.resolve(100));
  await early;
  assert.equal(await usage.bytes(), 150, "the write's own total stands");
});

test("a tiny cost is not shown as nothing", () => {
  assert.equal(formatCost(0.0001), "<$0.001");
  assert.equal(formatCost(0.0004), "<$0.001");
  assert.equal(formatCost(0.0005), "$0.001");
});

test("a cost that rounds up to a dollar uses dollar places", () => {
  assert.equal(formatCost(0.9995), "$1.00");
  assert.equal(formatCost(0.9996), "$1.00");
  assert.equal(formatCost(0.999), "$0.999");
});

test("an expiring store refuses a max below one", () => {
  assert.throws(() => createExpiringStore({ ttlMs: 1000, max: 0 }), /max/);
  assert.throws(() => createExpiringStore({ ttlMs: 1000, max: -1 }), /max/);
  assert.throws(() => createExpiringStore({ ttlMs: 1000 }), /max/);
});

test("putBack keeps the store within max", () => {
  const held = createExpiringStore({ ttlMs: 60_000, max: 2 });
  held.add("a", 1);
  held.add("b", 2);

  assert.equal(held.putBack("c", 3, Date.now() + 5_000), true);
  assert.equal(held.size, 2);
  assert.equal(held.get("a"), null, "the oldest went");
  assert.equal(held.get("c").value, 3);

  assert.equal(held.putBack("c", 4, Date.now() + 5_000), true);
  assert.equal(held.get("b").value, 2, "putting back a held key drops nothing");
  held.close();
});
