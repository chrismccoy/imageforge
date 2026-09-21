/**
 * Saving a batch of uploaded images
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");

const {
  saveOne,
  saveBatch,
  summarise,
  STORAGE_FULL,
  NOT_AN_IMAGE,
  COULD_NOT_SAVE,
} = require("../../../controllers/support/helpers/uploadBatch");

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(16),
]);

function aFile(name, buffer = PNG) {
  return { originalname: name, buffer };
}

function roomFor(answers = []) {
  const asked = [];
  return {
    asked,
    async write(bytes, save) {
      asked.push(bytes);
      const allowed = answers.length ? answers.shift() : true;
      if (allowed) await save();
      return allowed;
    },
  };
}

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-batch-"));
  const recorded = [];
  return {
    dir,
    recorded,
    options: (room = roomFor()) => ({
      room,
      uploadDir: dir,
      record: (row) => recorded.push(row),
      details: {
        prompt: "a cat",
        prompt_id: 3,
        model: "gpt-image-2",
        size: "1024x1024",
      },
      log: { error() {} },
    }),
  };
}

test("a file that is not an image is refused, and nothing is written", async () => {
  const { dir, recorded, options } = setup();

  const result = await saveOne(
    aFile("notes.txt", Buffer.from("plain text!!")),
    options()
  );

  assert.equal(result.error, NOT_AN_IMAGE);
  assert.equal(result.name, "notes.txt");
  assert.deepEqual(recorded, [], "nothing recorded");
  assert.deepEqual(fs.readdirSync(dir), [], "nothing written");
});

test("a file that fits is written and recorded with the batch's details", async () => {
  const { dir, recorded, options } = setup();

  const result = await saveOne(aFile("cat.png"), options());

  assert.equal(result.ok, true);
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].prompt, "a cat");
  assert.equal(recorded[0].model, "gpt-image-2");
  assert.match(recorded[0].filename, /\.png$/);
  assert.ok(
    fs.existsSync(path.join(dir, recorded[0].filename)),
    "the bytes are on disk under the name that was recorded"
  );
});

test("no room means no row", async () => {
  const { dir, recorded, options } = setup();

  const result = await saveOne(aFile("cat.png"), options(roomFor([false])));

  assert.equal(result.error, STORAGE_FULL);
  assert.deepEqual(recorded, []);
  assert.deepEqual(fs.readdirSync(dir), []);
});

test("a write that fails is reported against its own file", async () => {
  const { recorded, options } = setup();
  const room = {
    async write() {
      throw new Error("disk went away");
    },
  };

  const result = await saveOne(aFile("cat.png"), options(room));

  assert.equal(result.error, COULD_NOT_SAVE);
  assert.equal(result.name, "cat.png");
  assert.deepEqual(recorded, []);
});

test("a file with no name still has something to be reported as", async () => {
  const { options } = setup();
  const result = await saveOne({ buffer: Buffer.from("plain text!!") }, options());
  assert.equal(result.name, "that file");
});

test("a batch is saved in order, and each file answered for", async () => {
  const { recorded, options } = setup();
  const room = roomFor([true, false, true]);

  const results = await saveBatch(
    [aFile("one.png"), aFile("two.png"), aFile("three.png")],
    options(room)
  );

  assert.deepEqual(
    results.map((r) => r.name),
    ["one.png", "two.png", "three.png"]
  );
  assert.deepEqual(
    results.map((r) => Boolean(r.ok)),
    [true, false, true],
    "the one refused for want of room is the only failure"
  );
  assert.equal(recorded.length, 2);
  assert.equal(room.asked.length, 3, "every file was offered to the quota");
});

test("a whole batch that went through says so", () => {
  const batch = summarise([{ ok: true }, { ok: true }]);

  assert.equal(batch.all, true);
  assert.equal(batch.saved, 2);
  assert.deepEqual(batch.failures, []);
});

test("a batch that partly went through counts what did", () => {
  const batch = summarise([{ ok: true }, { error: NOT_AN_IMAGE }]);

  assert.equal(batch.all, false);
  assert.equal(batch.saved, 1);
  assert.match(batch.error, /Saved 1 of 2/);
});

test("one file that failed says why", () => {
  const batch = summarise([{ error: NOT_AN_IMAGE }]);

  assert.equal(batch.error, NOT_AN_IMAGE);
  assert.equal(batch.outOfRoom, false);
});

test("a batch that failed only for want of room is told apart", () => {
  const full = summarise([{ error: STORAGE_FULL }, { error: STORAGE_FULL }]);
  const mixed = summarise([{ error: STORAGE_FULL }, { error: NOT_AN_IMAGE }]);

  assert.equal(full.outOfRoom, true);
  assert.match(full.error, /Delete some saved images/);

  assert.equal(mixed.outOfRoom, false);
  assert.match(mixed.error, /None of those could be saved/);
});
