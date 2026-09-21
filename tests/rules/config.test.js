/**
 * Config tests
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const images = require("../../config/images");
const { env } = require("../../config/env");

const NOT_ENV_VARS = ["IS_PRODUCTION"];

test("model catalog and token list agree", () => {
  assert.deepEqual(images.MODEL_TOKENS, ["1.5", "2", "2.5-sunburst", "2.5-flare"]);
  assert.equal(images.MODELS["1.5"], "gpt-image-1.5");
  assert.equal(images.MODELS["2"], "gpt-image-2");
  assert.equal(images.MODELS["2.5-sunburst"], "gpt-image-2.5-sunburst");
  assert.equal(images.MODELS["2.5-flare"], "gpt-image-2.5-flare");
  assert.equal(images.DEFAULT_OPENAI_MODEL, "gpt-image-1.5");
});

test("normalizeModel forces unknown tokens to the fallback", () => {
  assert.equal(images.normalizeModel("2"), "2");
  assert.equal(images.normalizeModel("  1.5 "), "1.5");
  assert.equal(images.normalizeModel("nope"), "1.5");
  assert.equal(images.normalizeModel("nope", "2"), "2");
  assert.equal(images.normalizeModel(undefined), "1.5");
});

test("normalizeSize forces unknown sizes to the fallback", () => {
  assert.equal(images.normalizeSize("1536x1024"), "1536x1024");
  assert.equal(images.normalizeSize("auto"), "auto");
  assert.equal(images.normalizeSize("9x9"), "1024x1024");
  assert.equal(images.normalizeSize("9x9", "auto"), "auto");
});

test("env block exposes typed values", () => {
  assert.equal(typeof env.PORT, "number");
  assert.ok(Array.isArray(env.ALLOWED_IPS));
  assert.equal(typeof env.TRUST_PROXY, "boolean");
});

test(".env.example documents every environment value the app reads", () => {
  const example = fs.readFileSync(
    path.join(__dirname, "..", "..", ".env.example"),
    "utf8"
  );

  const documented = new Set(
    example
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => line.split("=")[0].trim())
  );

  const missing = Object.keys(env)
    .filter((key) => !NOT_ENV_VARS.includes(key))
    .filter((key) => !documented.has(key));

  assert.deepEqual(missing, [], `.env.example does not mention: ${missing}`);
});
