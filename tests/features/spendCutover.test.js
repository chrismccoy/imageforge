/**
 * Where spend is counted
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

const IMAGE_BYTES = Buffer.from("PNGBYTES");
const USAGE = {
  total: 100,
  input: 40,
  output: 60,
  inputText: 40,
  inputImage: 0,
  outputText: 10,
  outputImage: 50,
};

openai.generateImage = async () => ({
  model: "gpt-image-1.5",
  usage: USAGE,
  images: [
    {
      bytes: IMAGE_BYTES,
      dataUrl: `data:image/png;base64,${IMAGE_BYTES.toString("base64")}`,
    },
  ],
});

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

function ledgerImages(model) {
  const row = db
    .prepare("SELECT images FROM model_spend WHERE model = ?")
    .get(model);
  return row ? row.images : 0;
}

async function generate(prompt) {
  const res = await fetch(`${app.base}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf, cookie },
    body: JSON.stringify({ prompt, size: "1024x1024" }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  return body.images[0];
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

test("generating records the spend, and saving does not record it again", async () => {
  const before = ledgerImages("gpt-image-1.5");

  const gen = await generate("a red bicycle");
  assert.equal(
    ledgerImages("gpt-image-1.5"),
    before + 1,
    "the call was paid for, so the ledger knows already"
  );

  const saved = await save(gen.token);
  assert.equal(saved.status, 200);
  assert.equal(
    ledgerImages("gpt-image-1.5"),
    before + 1,
    "saving is the image arriving, not a second cost"
  );
});

test("a generation nobody saves is still counted", async () => {
  const before = ledgerImages("gpt-image-1.5");

  await generate("a blue kite nobody keeps");

  assert.equal(ledgerImages("gpt-image-1.5"), before + 1);
});

test("the saved row still carries its own usage for display", async () => {
  const gen = await generate("a counted bicycle");
  await save(gen.token);

  const row = db
    .prepare("SELECT * FROM generations ORDER BY id DESC LIMIT 1")
    .get();

  assert.equal(row.usage_total_tokens, 100);
  assert.equal(row.spend_counted, 1, "and says the ledger already knows");
});

test("a row with no API call behind it is still counted on insert", () => {
  const { buildModels } = require("../../models");
  const other = freshDb();
  const { Generation } = buildModels(other);

  Generation.add({ filename: "uploaded.png", model: "gpt-image-2" });

  const row = other
    .prepare("SELECT images FROM model_spend WHERE model = ?")
    .get("gpt-image-2");
  assert.equal(row.images, 1, "an upload is the trigger's business, as before");
});
