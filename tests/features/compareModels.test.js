/**
 * Comparing the models on one prompt
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";
process.env.RATE_LIMIT_GENERATE_MAX = "1000";

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

  if (rule.fail) throw new Error(rule.message || `${model} said no`);
  if (rule.failOnce) {
    rule.failOnce = false;
    throw new Error(`${model} said no`);
  }

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

test("comparing asks every model the same prompt, and the selected one twice", async () => {
  const out = await ask({ compare: "1", model: "2" });

  assert.equal(out.status, 200);
  assert.deepEqual(
    calls.map((call) => call.model).sort(),
    ["2", "2", "2.6-flare", "2.6-sunburst"]
  );
  assert.equal(
    new Set(calls.map((call) => call.prompt)).size,
    1,
    "and the same words to all, or the comparison means nothing"
  );
});

test("the doubled model follows the selection", async () => {
  for (const token of MODEL_TOKENS) {
    calls = [];
    await ask({ compare: "1", model: token });

    assert.equal(calls.length, 4, token);
    assert.equal(calls.filter((call) => call.model === token).length, 2, token);
  }
});

test("with nothing posted, the model from Settings is the one doubled", async () => {
  await ask({ compare: "1" });

  assert.equal(calls.filter((call) => call.model === "2.6-sunburst").length, 2);
});

test("each picture says which model made it, and tells a doubled model apart", async () => {
  const out = await ask({ compare: "1", model: "2" });

  assert.deepEqual(
    out.body.images.map((image) => [image.model, image.label]),
    [
      ["gpt-image-2", "gpt-image-2 #1"],
      ["gpt-image-2", "gpt-image-2 #2"],
      ["gpt-image-2.6-sunburst", "gpt-image-2.6-sunburst"],
      ["gpt-image-2.6-flare", "gpt-image-2.6-flare"],
    ]
  );
});

test("comparing is one picture per call however many the picker asked for", async () => {
  const out = await ask({ compare: "1", count: "4" });

  assert.equal(out.body.images.length, 4, "four in all, not four each");
  assert.deepEqual(
    calls.map((call) => call.n),
    [1, 1, 1, 1]
  );
});

test("the calls run alongside each other, not one after the other", async () => {
  behaviour = Object.fromEntries(MODEL_TOKENS.map((token) => [token, { delay: 120 }]));

  const started = Date.now();
  await ask({ compare: "1" });
  const took = Date.now() - started;

  assert.ok(took < 240, `took ${took}ms, so they overlapped`);
});

test("one model failing still shows the others, and says which is missing", async () => {
  behaviour = { "2.6-flare": { fail: true } };

  const out = await ask({ compare: "1", model: "2" });

  assert.equal(out.status, 200, "a partial answer is still an answer");
  assert.equal(out.body.images.length, 3);
  assert.equal(
    out.body.images.some((image) => image.model === MODELS["2.6-flare"]),
    false
  );
  assert.equal(out.body.failed.length, 1);
  assert.equal(
    out.body.failed[0].model,
    MODELS["2.6-flare"],
    "and it names the one that did not"
  );
});

test("a doubled model failing names both of its pictures", async () => {
  behaviour = { 2: { fail: true } };

  const out = await ask({ compare: "1", model: "2" });

  assert.equal(out.body.images.length, 2);
  assert.deepEqual(
    out.body.failed.map((one) => one.label),
    ["gpt-image-2 #1", "gpt-image-2 #2"]
  );
});

test("one half of a doubled model failing keeps the other half", async () => {
  behaviour = { 2: { failOnce: true } };

  const out = await ask({ compare: "1", model: "2" });

  assert.equal(out.body.images.length, 3);
  assert.deepEqual(
    out.body.failed.map((one) => one.label),
    ["gpt-image-2 #1"]
  );
  assert.ok(out.body.images.some((image) => image.label === "gpt-image-2 #2"));
});

test("every model failing is a failure, not an empty page", async () => {
  behaviour = Object.fromEntries(MODEL_TOKENS.map((token) => [token, { fail: true }]));

  const out = await ask({ compare: "1" });
  assert.equal(out.status, 400);
});

test("every model failing for the same reason says that reason once", async () => {
  const message = "You are out of credits, please add funds to continue generating images";
  behaviour = Object.fromEntries(
    MODEL_TOKENS.map((token) => [token, { fail: true, message }])
  );

  const out = await ask({ compare: "1" });
  assert.equal(out.status, 400);
  assert.equal(out.body.message, message);
});

test("every model failing for different reasons names each picture", async () => {
  behaviour = Object.fromEntries(MODEL_TOKENS.map((token) => [token, { fail: true }]));

  const out = await ask({ compare: "1", model: "2" });

  assert.match(out.body.message, /gpt-image-2 #1: 2 said no/);
  assert.match(out.body.message, /gpt-image-2 #2: 2 said no/);
});

test("a plain generation still asks one model, as it always did", async () => {
  const out = await ask({ model: "2", count: "2" });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, "2");
  assert.equal(calls[0].n, 2);
  assert.equal(out.body.images.length, 2);
  assert.equal(out.body.images[0].model, "gpt-image-2", "and says so too");
});

test("every model is charged for, on its own line", async () => {
  const images = () =>
    Object.fromEntries(
      db
        .prepare("SELECT model, images FROM model_spend")
        .all()
        .map((row) => [row.model, row.images])
    );

  const before = images();
  await ask({ compare: "1", model: "2" });
  const after = images();
  const added = (model) => (after[model] || 0) - (before[model] || 0);

  assert.equal(added("gpt-image-2"), 2, "the doubled model is charged twice");
  assert.equal(added("gpt-image-2.6-sunburst"), 1);
  assert.equal(added("gpt-image-2.6-flare"), 1);
});

test("a compare that half failed only charges for the half that worked", async () => {
  behaviour = { 2: { fail: true } };

  const before = db
    .prepare("SELECT images FROM model_spend WHERE model = 'gpt-image-2'")
    .get();
  await ask({ compare: "1", model: "2.6-flare" });
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
  assert.match(html, /always costs 4/, "and says what it will cost");
  assert.match(html, /id="compare"[^>]*data-images="4"/, "and tells the spinner");
});

test("the page offers three models, the third filling its own row", async () => {
  const html = await (
    await fetch(`${app.base}/generate`, { headers: { cookie } })
  ).text();

  assert.doesNotMatch(html, /value="1\.5"/);
  assert.match(html, /data-model-strip\s+class="grid grid-cols-2/);

  const labels = html.split("<label ").filter((part) => part.includes('name="model"'));
  assert.equal(labels.length, 3);
  assert.deepEqual(
    labels.map((label) => label.includes("col-span-2")),
    [false, false, true]
  );
});
