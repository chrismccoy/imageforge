/**
 * Usage tests
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");

const { readUsage, formatTokens } = require("../../../../utils/domain/usage");

const GPT_IMAGE_2 = {
  created: 1754817821,
  background: "opaque",
  data: [{ b64_json: "..." }],
  output_format: "png",
  quality: "high",
  size: "1024x1024",
  usage: {
    input_tokens: 15,
    input_tokens_details: { text_tokens: 15, image_tokens: 0 },
    output_tokens: 196,
    output_tokens_details: { text_tokens: 0, image_tokens: 196 },
    total_tokens: 211,
  },
};

const GPT_IMAGE_15 = {
  created: 1754818003,
  data: [{ b64_json: "..." }],
  usage: {
    input_tokens: 15,
    input_tokens_details: { text_tokens: 15, image_tokens: 0 },
    output_tokens: 1250,
    output_tokens_details: { text_tokens: 194, image_tokens: 1056 },
    total_tokens: 1265,
  },
};

test("reads every number from a gpt-image-2 response", () => {
  assert.deepEqual(readUsage(GPT_IMAGE_2), {
    total: 211,
    input: 15,
    output: 196,
    inputText: 15,
    inputImage: 0,
    outputText: 0,
    outputImage: 196,
  });
});

test("reads the output split that gpt-image-1.5 actually returns", () => {
  const usage = readUsage(GPT_IMAGE_15);
  assert.equal(usage.total, 1265);
  assert.equal(usage.output, 1250);
  assert.equal(usage.outputText, 194);
  assert.equal(usage.outputImage, 1056);
});

test("a zero count is kept, not treated as missing", () => {
  assert.equal(readUsage(GPT_IMAGE_2).inputImage, 0);
  assert.equal(readUsage(GPT_IMAGE_2).outputText, 0);
});

test("a payload with no usage yields nothing", () => {
  assert.equal(readUsage({ data: [{ b64_json: "..." }] }), null);
  assert.equal(readUsage({}), null);
  assert.equal(readUsage(null), null);
  assert.equal(readUsage(undefined), null);
  assert.equal(readUsage("nonsense"), null);
  assert.equal(readUsage(42), null);
  assert.equal(readUsage({ usage: null }), null);
  assert.equal(readUsage({ usage: "nonsense" }), null);
});

test("missing details objects leave their fields null", () => {
  const usage = readUsage({
    usage: { total_tokens: 100, input_tokens: 40, output_tokens: 60 },
  });
  assert.equal(usage.total, 100);
  assert.equal(usage.input, 40);
  assert.equal(usage.output, 60);
  assert.equal(usage.inputText, null);
  assert.equal(usage.inputImage, null);
  assert.equal(usage.outputText, null);
  assert.equal(usage.outputImage, null);
});

test("individual missing fields are null rather than absent", () => {
  const usage = readUsage({ usage: { total_tokens: 7 } });
  assert.equal(usage.total, 7);
  assert.equal(usage.input, null);
  assert.equal(usage.output, null);
  assert.deepEqual(Object.keys(usage).sort(), [
    "input",
    "inputImage",
    "inputText",
    "output",
    "outputImage",
    "outputText",
    "total",
  ]);
});

test("values that are not finite numbers are rejected", () => {
  const usage = readUsage({
    usage: {
      total_tokens: "100",
      input_tokens: -5,
      output_tokens: NaN,
      input_tokens_details: { text_tokens: Infinity, image_tokens: null },
      output_tokens_details: { text_tokens: {}, image_tokens: true },
    },
  });
  assert.deepEqual(usage, {
    total: null,
    input: null,
    output: null,
    inputText: null,
    inputImage: null,
    outputText: null,
    outputImage: null,
  });
});

test("reading a payload never throws", () => {
  const nasty = [
    { usage: [] },
    { usage: { input_tokens_details: "no" } },
    { usage: { output_tokens_details: 5 } },
    [],
    () => {},
  ];
  for (const payload of nasty) {
    assert.doesNotThrow(() => readUsage(payload), `threw on ${String(payload)}`);
  }
});

test("formatTokens groups thousands and keeps zero", () => {
  assert.equal(formatTokens(1234), "1,234");
  assert.equal(formatTokens(211), "211");
  assert.equal(formatTokens(0), "0");
  assert.equal(formatTokens(1000000), "1,000,000");
});

test("formatTokens rejects anything that is not a finite number", () => {
  assert.equal(formatTokens(null), null);
  assert.equal(formatTokens(undefined), null);
  assert.equal(formatTokens("1234"), null);
  assert.equal(formatTokens(NaN), null);
  assert.equal(formatTokens(Infinity), null);
  assert.equal(formatTokens(-1), null);
});

const { splitUsage } = require("../../../../utils/domain/usage");

const WHOLE = {
  total: 101,
  input: 41,
  output: 60,
  inputText: 21,
  inputImage: 20,
  outputText: 30,
  outputImage: 30,
};

test("splitUsage gives every image an equal share", () => {
  const parts = splitUsage({ ...WHOLE, total: 100 }, 4);

  assert.equal(parts.length, 4);
  assert.equal(parts[1].total, 25);
  assert.equal(parts[2].total, 25);
  assert.equal(parts[3].total, 25);
});

test("splitUsage gives the remainder to the first image, so the parts sum to the whole", () => {
  const parts = splitUsage(WHOLE, 4);

  for (const key of Object.keys(WHOLE)) {
    const sum = parts.reduce((total, part) => total + part[key], 0);
    assert.equal(sum, WHOLE[key], `${key} should sum back to ${WHOLE[key]}`);
  }

  assert.equal(parts[0].total, 26, "the odd token goes to the first image");
  assert.equal(parts[1].total, 25);
});

test("splitUsage over one image is the whole thing", () => {
  assert.deepEqual(splitUsage(WHOLE, 1), [WHOLE]);
});

test("splitUsage of nothing is nothing, once per image", () => {
  assert.deepEqual(splitUsage(null, 3), [null, null, null]);
});

test("splitUsage keeps a missing field missing rather than turning it into zero", () => {
  const parts = splitUsage({ ...WHOLE, outputImage: null }, 2);

  assert.equal(parts[0].outputImage, null);
  assert.equal(parts[1].outputImage, null);
});
