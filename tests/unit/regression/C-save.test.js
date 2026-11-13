/**
 * Saving a held image: no orphans, a checked prompt, the real file type
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");

const buildController = require("../../../controllers/generationsSaveController");
const { createPendingImages } = require("../../../services/pendingImages");
const { createUploadsUsage } = require("../../../services/uploadsUsage");
const { quietLog } = require("../../helpers/quietLog");

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(16),
]);
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(20),
]);

function fakeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function setup({ add, prompts = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-save-"));
  const pending = createPendingImages();
  const usage = createUploadsUsage({ dir });
  let forgot = 0;
  const forget = usage.forget;
  usage.forget = () => {
    forgot += 1;
    forget();
  };
  const rows = [];
  const Generation = {
    add: add || ((row) => rows.push(row)),
    trashed: () => [],
  };
  const Prompt = { get: (id) => prompts[id] || null };
  const ctrl = buildController({
    models: { Generation, Prompt },
    pending,
    usage,
    folders: { uploadDir: dir },
    log: quietLog(),
  });
  return {
    dir,
    rows,
    pending,
    ctrl,
    forgot: () => forgot,
    done() {
      pending.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("a failed insert leaves no file, frees the quota and keeps the image", async () => {
  const s = setup({
    add() {
      throw new Error("SQLITE_BUSY");
    },
  });
  try {
    const token = s.pending.put(PNG, { prompt: "a cat" });
    const res = fakeRes();
    await s.ctrl.save({ body: { token } }, res);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(fs.readdirSync(s.dir), [], "no orphan file");
    assert.ok(s.forgot() >= 1, "the quota is read again");
    assert.ok(s.pending.peek(token), "the image can still be saved");
  } finally {
    s.done();
  }
});

test("a write that fails part way leaves no partial file", async () => {
  const s = setup();
  const realWrite = fsp.writeFile;
  fsp.writeFile = async (full, bytes, options) => {
    await realWrite(full, bytes.subarray(0, 4), options);
    throw Object.assign(new Error("ENOSPC: no space left"), { code: "ENOSPC" });
  };
  try {
    const token = s.pending.put(PNG, { prompt: "a cat" });
    const res = fakeRes();
    await s.ctrl.save({ body: { token } }, res);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(fs.readdirSync(s.dir), [], "no partial file");
    assert.ok(s.pending.peek(token), "the image can still be saved");
  } finally {
    fsp.writeFile = realWrite;
    s.done();
  }
});

test("a prompt_id that names no prompt falls back to the held one", async () => {
  const s = setup({ prompts: { 7: { id: 7 } } });
  try {
    const first = s.pending.put(PNG, { prompt: "a cat", prompt_id: 5 });
    await s.ctrl.save({ body: { token: first, prompt_id: "99" } }, fakeRes());
    assert.equal(s.rows[0].prompt_id, 5, "an unknown id is ignored");

    const second = s.pending.put(PNG, { prompt: "a cat", prompt_id: 5 });
    await s.ctrl.save({ body: { token: second, prompt_id: "7" } }, fakeRes());
    assert.equal(s.rows[1].prompt_id, 7, "a real prompt is used");
  } finally {
    s.done();
  }
});

test("a held JPEG is saved as a .jpg, not labelled PNG", async () => {
  const s = setup();
  try {
    const token = s.pending.put(JPEG, { prompt: "a cat" });
    const res = fakeRes();
    await s.ctrl.save({ body: { token } }, res);

    assert.equal(res.statusCode, 200);
    assert.match(s.rows[0].filename, /\.jpg$/);
    assert.match(res.body.url, /\.jpg$/);
  } finally {
    s.done();
  }
});
