/**
 * OpenAI call duration tests
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");

const { generateImage, editImage } = require("../../../services/openai");

const B64 = Buffer.from("HELLO").toString("base64");

function slowClient(waitMs) {
  const answer = async () => {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return { data: [{ b64_json: B64 }, { b64_json: B64 }] };
  };
  return { images: { generate: answer, edit: answer } };
}

test("a generation reports how long the call took", async () => {
  const out = await generateImage({
    prompt: "a cat",
    size: "1024x1024",
    apiKey: "k",
    model: "2",
    n: 2,
    client: slowClient(60),
  });

  assert.equal(typeof out.durationMs, "number");
  assert.ok(out.durationMs >= 55, `took ${out.durationMs}ms`);
  assert.ok(out.durationMs < 1000, `took ${out.durationMs}ms`);
});

test("an edit reports how long the call took", async () => {
  const out = await editImage({
    prompt: "a cat",
    size: "1024x1024",
    apiKey: "k",
    model: "2",
    imageBytes: Buffer.from("IMG"),
    maskBytes: Buffer.from("MASK"),
    client: slowClient(60),
  });

  assert.ok(out.durationMs >= 55, `took ${out.durationMs}ms`);
  assert.ok(out.durationMs < 1000, `took ${out.durationMs}ms`);
});
