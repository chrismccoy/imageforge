/**
 * Uploads leave no orphans and never overwrite a saved file
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  saveOne,
  COULD_NOT_SAVE,
} = require("../../../controllers/support/helpers/uploadBatch");

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(16),
]);

function roomWithForget() {
  const room = {
    forgot: 0,
    async write(bytes, save) {
      await save();
      return true;
    },
    forget() {
      room.forgot += 1;
    },
  };
  return room;
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "forge-upload-"));
}

test("a failed record removes the written file and frees the quota", async () => {
  const dir = tempDir();
  const room = roomWithForget();
  try {
    const result = await saveOne(
      { originalname: "cat.png", buffer: PNG },
      {
        room,
        uploadDir: dir,
        record() {
          throw new Error("SQLITE_BUSY");
        },
        details: {},
        log: { error() {} },
      }
    );

    assert.equal(result.error, COULD_NOT_SAVE);
    assert.deepEqual(fs.readdirSync(dir), [], "no orphan file");
    assert.equal(room.forgot, 1, "the quota is read again");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a name that is already taken is not overwritten", async () => {
  const dir = tempDir();
  const realRandom = crypto.randomBytes;
  const fixed = Buffer.from("aaaaaa", "hex");
  let fixedLeft = 1;
  crypto.randomBytes = (n, ...rest) =>
    fixedLeft-- > 0 ? fixed : realRandom(n, ...rest);

  try {
    // The colliding name, for this second and the next, already on disk.
    const now = Date.now();
    const taken = [now, now + 1000].map(
      (at) =>
        `image-forge-${new Date(at)
          .toISOString()
          .replace(/\D/g, "")
          .slice(0, 14)}-aaaaaa.png`
    );
    for (const name of taken) fs.writeFileSync(path.join(dir, name), "KEEP");

    const recorded = [];
    const result = await saveOne(
      { originalname: "cat.png", buffer: PNG },
      {
        room: roomWithForget(),
        uploadDir: dir,
        record: (row) => recorded.push(row),
        details: {},
        log: { error() {} },
      }
    );

    assert.equal(result.ok, true);
    for (const name of taken) {
      assert.equal(
        fs.readFileSync(path.join(dir, name), "utf8"),
        "KEEP",
        "the saved file is untouched"
      );
    }
    assert.ok(!taken.includes(recorded[0].filename), "a fresh name is used");
    assert.deepEqual(fs.readFileSync(path.join(dir, recorded[0].filename)), PNG);
  } finally {
    crypto.randomBytes = realRandom;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
