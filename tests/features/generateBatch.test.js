/**
 * Generating a batch
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");

const openai = require("../../services/openai");

const USAGE = {
  total: 101,
  input: 40,
  output: 61,
  inputText: 40,
  inputImage: 0,
  outputText: 11,
  outputImage: 50,
};

let asked = null;

openai.generateImage = async ({ n = 1 }) => {
  asked = n;
  return {
    model: "gpt-image-1.5",
    usage: USAGE,
    images: Array.from({ length: n }, (_unused, index) => {
      const bytes = Buffer.from(`IMAGE${index}`);
      return {
        bytes,
        dataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
      };
    }),
  };
};

const { startApp, signIn, csrfFor, freshDb } = require("../helpers/app");
const { uploadPath } = require("../../utils/files/uploads");
const { UPLOAD_DIR } = require("../../config/paths");

let app;
let db;
let cookie;
let csrf;
const savedFiles = [];

test.before(async () => {
  db = freshDb();
  app = await startApp({ db });
  cookie = await signIn(app.base);
  csrf = await csrfFor(app.base, cookie);
});

test.after(() => {
  app.stop();
  for (const full of savedFiles) {
    fs.rmSync(full, { force: true });
  }
});

async function generate(prompt, count) {
  const res = await fetch(`${app.base}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf, cookie },
    body: JSON.stringify({ prompt, size: "1024x1024", count }),
  });
  return { status: res.status, body: await res.json() };
}

async function save(token) {
  const res = await fetch(`${app.base}/api/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf, cookie },
    body: JSON.stringify({ token, prompt_id: "" }),
  });
  const body = await res.json();
  if (res.status === 200) {
    savedFiles.push(uploadPath(body.url.replace("/uploads/", ""), UPLOAD_DIR).full);
  }
  return { status: res.status, body };
}

function latestRow() {
  return db.prepare("SELECT * FROM generations ORDER BY id DESC LIMIT 1").get();
}

function ledgerImages() {
  const row = db
    .prepare("SELECT images FROM model_spend WHERE model = ?")
    .get("gpt-image-1.5");
  return row ? row.images : 0;
}

test("a count of one still answers with a list of one", async () => {
  const { status, body } = await generate("a lone bicycle", 1);

  assert.equal(status, 200);
  assert.equal(body.images.length, 1);
  assert.equal(typeof body.images[0].token, "string");
  assert.match(body.images[0].url, /^data:image\/png;base64,/);
  assert.equal(body.token, undefined, "the old single-image shape is gone");
});

test("a count of four returns four separate tokens", async () => {
  const { body } = await generate("four bicycles", 4);

  assert.equal(asked, 4, "the count reached the API call");
  assert.equal(body.images.length, 4);

  const tokens = body.images.map((image) => image.token);
  assert.equal(new Set(tokens).size, 4, "a token per image, all different");
});

test("any image of a batch can be saved on its own", async () => {
  const { body } = await generate("a pickable batch", 4);

  const third = await save(body.images[2].token);
  assert.equal(third.status, 200);

  const first = await save(body.images[0].token);
  assert.equal(first.status, 200, "the others are still saveable afterwards");
});

test("the ledger records every image, however many are kept", async () => {
  const before = ledgerImages();

  const { body } = await generate("a costly batch", 4);
  assert.equal(ledgerImages(), before + 4, "four were paid for");

  await save(body.images[1].token);
  assert.equal(ledgerImages(), before + 4, "keeping one does not change that");
});

test("each image carries its own share of the batch's usage", async () => {
  const { body } = await generate("a counted batch", 4);

  await save(body.images[1].token);
  assert.equal(latestRow().usage_total_tokens, 25, "101 over four, floored");

  await save(body.images[0].token);
  assert.equal(latestRow().usage_total_tokens, 26, "the first carries the odd one");
});

test("an unusable count falls back to one rather than failing", async () => {
  const { status, body } = await generate("a nonsense count", "99");

  assert.equal(status, 200);
  assert.equal(body.images.length, 1);
});

test("a saved batch image says the ledger already knows about it", async () => {
  const { body } = await generate("an accounted batch", 2);

  await save(body.images[0].token);
  assert.equal(latestRow().spend_counted, 1);
});
