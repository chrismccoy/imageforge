/**
 * Image option tests
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  MODELS,
  MODEL_TOKENS,
  MODEL_BY_ID,
  DEFAULT_MODEL,
  DEFAULT_OPENAI_MODEL,
  normalizeModel,
  pickerModel,
} = require("../../../config/images");

test("every model the app offers is keyed by its own token", () => {
  assert.deepEqual(MODEL_TOKENS, ["1.5", "2", "2.5-sunburst", "2.5-flare"]);
  assert.deepEqual(MODELS, {
    "1.5": "gpt-image-1.5",
    2: "gpt-image-2",
    "2.5-sunburst": "gpt-image-2.5-sunburst",
    "2.5-flare": "gpt-image-2.5-flare",
  });
});

test("every token has a full model name to show on its button", () => {
  for (const token of MODEL_TOKENS) {
    assert.equal(typeof MODELS[token], "string");
    assert.match(MODELS[token], /^gpt-image-/);
  }
});

test("a full model name maps back to its token", () => {
  assert.equal(MODEL_BY_ID["gpt-image-2.5-sunburst"], "2.5-sunburst");
  assert.equal(MODEL_BY_ID["gpt-image-2.5-flare"], "2.5-flare");
  assert.equal(pickerModel("gpt-image-2.5-flare"), "2.5-flare");
});

test("the default is unchanged by the newer models", () => {
  assert.equal(DEFAULT_MODEL, "1.5");
  assert.equal(DEFAULT_OPENAI_MODEL, "gpt-image-1.5");
});

test("a new token is accepted and an unknown one falls back", () => {
  assert.equal(normalizeModel("2.5-sunburst"), "2.5-sunburst");
  assert.equal(normalizeModel("2.5-flare"), "2.5-flare");
  assert.equal(normalizeModel("gpt-image-2.5-flare"), DEFAULT_MODEL);
  assert.equal(normalizeModel("nonsense"), DEFAULT_MODEL);
});

test("a token is safe to put in a form field name", () => {
  for (const token of MODEL_TOKENS) {
    assert.match(token, /^[A-Za-z0-9.-]+$/);
  }
});
