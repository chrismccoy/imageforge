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
  compareLineup,
  COMPARE_IMAGES,
} = require("../../../config/images");

test("every model the app offers is keyed by its own token", () => {
  assert.deepEqual(MODEL_TOKENS, ["2", "2.5-sunburst", "2.5-flare"]);
  assert.deepEqual(MODELS, {
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

test("the default is the same model editing starts with", () => {
  assert.equal(DEFAULT_MODEL, "2.5-sunburst");
  assert.equal(DEFAULT_OPENAI_MODEL, "gpt-image-2.5-sunburst");
});

test("a retired model is no longer accepted", () => {
  assert.equal(normalizeModel("1.5"), "2.5-sunburst");
  assert.equal(pickerModel("gpt-image-1.5"), "2.5-sunburst");
});

test("a compare doubles the selected model, side by side", () => {
  assert.deepEqual(compareLineup("2"), [
    { token: "2", label: "gpt-image-2 #1" },
    { token: "2", label: "gpt-image-2 #2" },
    { token: "2.5-sunburst", label: "gpt-image-2.5-sunburst" },
    { token: "2.5-flare", label: "gpt-image-2.5-flare" },
  ]);
  assert.deepEqual(compareLineup("2.5-flare"), [
    { token: "2", label: "gpt-image-2" },
    { token: "2.5-sunburst", label: "gpt-image-2.5-sunburst" },
    { token: "2.5-flare", label: "gpt-image-2.5-flare #1" },
    { token: "2.5-flare", label: "gpt-image-2.5-flare #2" },
  ]);
});

test("a compare still fills the grid when the selection is not a model", () => {
  for (const selected of ["1.5", "nonsense", "", undefined]) {
    const lineup = compareLineup(selected);
    assert.equal(lineup.length, 4, String(selected));
    assert.equal(lineup.filter((one) => one.token === "2.5-sunburst").length, 2);
  }
});

test("a compare is always four images, whichever model is selected", () => {
  assert.equal(COMPARE_IMAGES, 4);
  for (const token of MODEL_TOKENS) {
    assert.equal(compareLineup(token).length, COMPARE_IMAGES, token);
  }
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
