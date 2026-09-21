/**
 * Comparing the models on one prompt
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";

const test = require("node:test");
const assert = require("node:assert/strict");

const openai = require("../../services/openai");
const { MODEL_TOKENS, MODELS } = require("../../config/images");

const BYTES = Buffer.from("PNGBYTES");
const USAGE = { total: 100, input: 40, output: 60 };

let calls = [];
let behaviour = {};

openai.generateImage = async ({ model, n, prompt }) => {
  const started = Date.now();
  calls.push({ model, n, prompt, started });

  const rule = behaviour[model] || {};
  await new Promise((resolve) => setTimeout(resolve, rule.delay || 20));

  if (rule.fail) throw new Error(`${model} said no`);

  return {
    model: `gpt-image-${model}`,
    usage: USAGE,
    images: Array.from({ length: n || 1 }, () => ({
      bytes: BYTES,
      dataUrl: `data:image/png;base64,${BYTES.toString("base64")}`,
    })),
  };
};

const { startApp, signIn, csrfFor, freshDb } = require("../helpers/app");

let app;
let db;
let cookie;
let csrf;

test.before(async () => {
  db = freshDb();
  app = await startApp({ db });
  cookie = await signIn(app.base);
  csrf = await csrfFor(app.base, cookie);
});

test.after(() => app.stop());

test.beforeEach(() => {
  calls = [];
  behaviour = {};
});

async function ask(body) {
  const res = await fetch(`${app.base}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf, cookie },
    body: JSON.stringify({ prompt: "a red bicycle", size: "1024x1024", ...body }),
  });
  return { status: res.status, body: await res.json() };
}

test("comparing asks every model the same prompt", async () => {
  const out = await ask({ compare: "1" });

  assert.equal(out.status, 200);
  assert.equal(calls.length, MODEL_TOKENS.length, "one call per model");
  assert.deepEqual(
    calls.map((call) => call.model).sort(),
    [...MODEL_TOKENS].sort(),
    "one to each model"
  );
  assert.equal(
    new Set(calls.map((call) => call.prompt)).size,
    1,
    "and the same words to both, or the comparison means nothing"
  );
});

test("each picture says which model made it", async () => {
  const out = await ask({ compare: "1" });

  assert.equal(out.body.images.length, MODEL_TOKENS.length);
  assert.deepEqual(
    out.body.images.map((image) => image.model).sort(),
    MODEL_TOKENS.map((token) => MODELS[token]).sort()
  );
});

test("comparing is one picture per model however many the picker asked for", async () => {
  const out = await ask({ compare: "1", count: "4" });

  assert.equal(out.body.images.length, MODEL_TOKENS.length, "one each, not four each");
  assert.deepEqual(
    calls.map((call) => call.n),
    MODEL_TOKENS.map(() => 1)
  );
});

test("the two calls run alongside each other, not one after the other", async () => {
  behaviour = Object.fromEntries(MODEL_TOKENS.map((token) => [token, { delay: 120 }]));

  const started = Date.now();
  await ask({ compare: "1" });
  const took = Date.now() - started;

  assert.ok(took < 240, `took ${took}ms, so they overlapped`);
});

test("one model failing still shows the others, and says which is missing", async () => {
  behaviour = { 2: { fail: true } };

  const out = await ask({ compare: "1" });

  assert.equal(out.status, 200, "a partial answer is still an answer");
  assert.equal(out.body.images.length, MODEL_TOKENS.length - 1);
  assert.equal(
    out.body.images.some((image) => image.model === MODELS["2"]),
    false
  );
  assert.equal(out.body.failed.length, 1);
  assert.equal(out.body.failed[0].model, MODELS["2"], "and it names the one that did not");
});

test("every model failing is a failure, not an empty page", async () => {
  behaviour = Object.fromEntries(MODEL_TOKENS.map((token) => [token, { fail: true }]));

  const out = await ask({ compare: "1" });
  assert.equal(out.status, 400);
});

test("a plain generation still asks one model, as it always did", async () => {
  const out = await ask({ model: "2", count: "2" });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, "2");
  assert.equal(calls[0].n, 2);
  assert.equal(out.body.images.length, 2);
  assert.equal(out.body.images[0].model, "gpt-image-2", "and says so too");
});

test("both models are charged for, on their own lines", async () => {
  await ask({ compare: "1" });

  const rows = db
    .prepare("SELECT model, images FROM model_spend ORDER BY model")
    .all();
  const seen = Object.fromEntries(rows.map((row) => [row.model, row.images]));

  assert.ok(seen["gpt-image-1.5"] >= 1, "1.5 was charged");
  assert.ok(seen["gpt-image-2"] >= 1, "and so was 2");
});

test("a compare that half failed only charges for the half that worked", async () => {
  behaviour = { 2: { fail: true } };

  const before = db
    .prepare("SELECT images FROM model_spend WHERE model = 'gpt-image-2'")
    .get();
  await ask({ compare: "1" });
  const after = db
    .prepare("SELECT images FROM model_spend WHERE model = 'gpt-image-2'")
    .get();

  assert.equal(
    (after && after.images) || 0,
    (before && before.images) || 0,
    "a call that threw bought nothing"
  );
});

test("the page offers the compare toggle", async () => {
  const html = await (
    await fetch(`${app.base}/generate`, { headers: { cookie } })
  ).text();

  assert.match(html, /id="compare"/);
  assert.match(
    html,
    new RegExp(`always costs ${MODEL_TOKENS.length}`),
    "and says what it will cost"
  );
});
