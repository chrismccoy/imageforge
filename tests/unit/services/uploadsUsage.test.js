/**
 * The uploads quota
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { createUploadsUsage } = require("../../../services/uploadsUsage");

function folderOf(sizes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-usage-"));
  sizes.forEach((size, at) =>
    fs.writeFileSync(path.join(dir, `f${at}.bin`), Buffer.alloc(size))
  );
  return dir;
}

test("it reports what the folder weighs", async () => {
  const dir = folderOf([100, 50]);
  try {
    const usage = createUploadsUsage({ dir, quotaBytes: 1000 });
    assert.equal(await usage.bytes(), 150);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("it measures the folder once, not once per question", async () => {
  const dir = folderOf([100]);
  try {
    const usage = createUploadsUsage({ dir, quotaBytes: 1000 });
    assert.equal(await usage.bytes(), 100);

    fs.writeFileSync(path.join(dir, "sneaked.bin"), Buffer.alloc(70));
    assert.equal(await usage.bytes(), 100);

    usage.forget();
    assert.equal(await usage.bytes(), 170);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("what it writes itself, it counts", async () => {
  const dir = folderOf([]);
  try {
    const usage = createUploadsUsage({ dir, quotaBytes: 1000 });

    const wrote = await usage.write(200, () =>
      fsp.writeFile(path.join(dir, "one.bin"), Buffer.alloc(200))
    );

    assert.equal(wrote, true);
    assert.equal(await usage.bytes(), 200);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a refused save writes nothing and costs nothing", async () => {
  const dir = folderOf([900]);
  try {
    const usage = createUploadsUsage({ dir, quotaBytes: 1000 });

    let ran = false;
    const wrote = await usage.write(200, async () => {
      ran = true;
    });

    assert.equal(wrote, false, "over the quota");
    assert.equal(ran, false, "and the write never ran");
    assert.equal(await usage.bytes(), 900, "so the total is unchanged");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("two saves at once cannot both take the last of the room", async () => {
  const dir = folderOf([]);
  try {
    const usage = createUploadsUsage({ dir, quotaBytes: 250 });

    const slowWrite = (name) => async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      await fsp.writeFile(path.join(dir, name), Buffer.alloc(200));
    };

    const [first, second] = await Promise.all([
      usage.write(200, slowWrite("a.bin")),
      usage.write(200, slowWrite("b.bin")),
    ]);

    assert.deepEqual(
      [first, second].filter(Boolean).length,
      1,
      "exactly one of them may have the room"
    );

    usage.forget();
    assert.equal(await usage.bytes(), 200, "and only one file landed");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a write that throws leaves the total alone", async () => {
  const dir = folderOf([100]);
  try {
    const usage = createUploadsUsage({ dir, quotaBytes: 1000 });

    await assert.rejects(
      usage.write(200, async () => {
        throw new Error("disk said no");
      }),
      /disk said no/
    );

    assert.equal(await usage.bytes(), 100, "nothing landed, nothing counted");

    const wrote = await usage.write(50, () =>
      fsp.writeFile(path.join(dir, "after.bin"), Buffer.alloc(50))
    );
    assert.equal(wrote, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
