/**
 * Which failures reach the caller, and under which status
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const openai = require("../../../services/openai");

let failWith = null;
const ok = {
  model: "gpt-image-2",
  usage: null,
  durationMs: 1,
  bytes: Buffer.from("PNG"),
  dataUrl: "data:image/png;base64,UE5H",
  images: [{ bytes: Buffer.from("PNG"), dataUrl: "data:image/png;base64,UE5H" }],
};
openai.generateImage = async () => {
  if (failWith) throw failWith;
  return ok;
};
openai.editImage = async () => {
  if (failWith) throw failWith;
  return ok;
};

const buildGenerate = require("../../../controllers/generateController");
const buildEdit = require("../../../controllers/editController");
const buildTransfer = require("../../../controllers/promptTransferController");
const { quietLog } = require("../../helpers/quietLog");

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
    render(view, locals) {
      this.view = view;
      this.locals = locals;
      return this;
    },
  };
}

function shownError(message, status) {
  return Object.assign(new Error(message), { status, expose: true });
}

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from([0, 0, 0, 13]),
  Buffer.from("IHDR"),
  Buffer.from([0, 0, 0, 1, 0, 0, 0, 1]),
]);

function deps(Spend = { recordGenerated() {} }) {
  return {
    models: {
      Prompt: {},
      Generation: { get: (id) => ({ id, filename: "a.png", prompt_id: null }) },
      Spend,
    },
    openaiCredentials: { apiKey: () => "k", model: () => "2" },
    pending: { put: () => "token" },
    log: quietLog(),
  };
}

async function runGenerate(ctrlDeps = deps(), body = {}) {
  const res = fakeRes();
  let passed = null;
  await buildGenerate(ctrlDeps).generate(
    {
      body: { prompt: "a cat", ...body },
      settings: { default_size: "1024x1024" },
    },
    res,
    (err) => {
      passed = err;
    }
  );
  return { res, passed };
}

async function runEdit(ctrlDeps = deps()) {
  const res = fakeRes();
  let passed = null;
  await buildEdit(ctrlDeps).edit(
    {
      body: { source_id: "1", prompt: "a hat" },
      files: {
        image: [{ buffer: PNG }],
        mask: [{ buffer: PNG }],
      },
      settings: { default_size: "1024x1024" },
    },
    res,
    (err) => {
      passed = err;
    }
  );
  return { res, passed };
}

test.afterEach(() => {
  failWith = null;
});

for (const [name, run] of [
  ["generate", runGenerate],
  ["edit", runEdit],
]) {
  test(`${name}: an unexpected error is passed on, not shown as a 400`, async () => {
    failWith = new Error("SQLITE_BUSY: database is locked");
    const { res, passed } = await run();
    assert.equal(passed, failWith, "handed to the error handler");
    assert.notEqual(res.statusCode, 400);
    assert.equal(res.body, null, "nothing internal is sent");
  });

  test(`${name}: an upstream failure keeps its own status`, async () => {
    failWith = shownError("OpenAI is limiting requests right now.", 503);
    const { res, passed } = await run();
    assert.equal(passed, null);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.message, "OpenAI is limiting requests right now.");
  });

  test(`${name}: a validation error is still a 400 with its message`, async () => {
    failWith = shownError("The prompt is empty.", 400);
    const { res } = await run();
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, "The prompt is empty.");
  });

  test(`${name}: a ledger failure after the call is not shown as a 400`, async () => {
    const boom = new Error("no such table: model_spend");
    const { res, passed } = await run(
      deps({
        recordGenerated() {
          throw boom;
        },
      })
    );
    assert.equal(passed, boom);
    assert.equal(res.body, null);
  });
}

test("compare: an unexpected error does not leak its message", async () => {
  failWith = new Error("SQLITE_BUSY: database is locked");
  const { res } = await runGenerate(deps(), { compare: "1" });
  assert.notEqual(res.statusCode, 400);
  assert.ok(res.statusCode >= 500);
  assert.doesNotMatch(res.body.message, /SQLITE/);
});

test("compare: an upstream failure on every model keeps its status", async () => {
  failWith = shownError("OpenAI is limiting requests right now.", 503);
  const { res } = await runGenerate(deps(), { compare: "1" });
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.message, "OpenAI is limiting requests right now.");
});

test("a database failure during a prompt import is a 500, not a 400", () => {
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-transfer-"));
  try {
    const ctrl = buildTransfer({
      models: {
        Prompt: {},
        ops: {
          importPrompts() {
            throw new Error("SQLITE_FULL: database or disk is full");
          },
        },
      },
      folders: { backupDir },
      log: quietLog(),
    });
    const res = fakeRes();
    const body = JSON.stringify({ prompts: [{ name: "Sky", prompt: "a sky" }] });
    ctrl.importFile({ file: { buffer: Buffer.from(body) } }, res);

    assert.equal(res.view, "backup");
    assert.match(res.locals.importError, /import failed/);
    assert.equal(res.statusCode, 500);
  } finally {
    fs.rmSync(backupDir, { recursive: true, force: true });
  }
});
