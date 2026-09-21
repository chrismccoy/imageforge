/**
 * OpenAI image service tests
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");

const { generateImage } = require("../../../services/openai");
const { quietLog } = require("../../helpers/quietLog");

function fakeClient(result) {
  return { images: { generate: async () => result } };
}

test("throws a clear message when no API key is given", async () => {
  await assert.rejects(
    () => generateImage({ prompt: "a cat", size: "1024x1024", apiKey: "" }),
    /No OpenAI API key/
  );
});

test("throws when the prompt is blank", async () => {
  await assert.rejects(
    () => generateImage({ prompt: "   ", size: "1024x1024", apiKey: "k" }),
    /prompt is empty/
  );
});

test("returns bytes and a data URL from a b64_json result", async () => {
  const b64 = Buffer.from("HELLO").toString("base64");
  const client = fakeClient({ data: [{ b64_json: b64 }] });

  const out = await generateImage({
    prompt: "a cat",
    size: "1024x1024",
    apiKey: "k",
    model: "2",
    client,
  });

  assert.equal(out.model, "gpt-image-2");
  assert.deepEqual(out.images[0].bytes, Buffer.from("HELLO"));
  assert.equal(out.images[0].dataUrl, `data:image/png;base64,${b64}`);
});

test("sends the resolved model, size, prompt, and n to the SDK", async () => {
  let seen = null;
  const client = {
    images: {
      generate: async (params) => {
        seen = params;
        return { data: [{ b64_json: Buffer.from("Z").toString("base64") }] };
      },
    },
  };

  await generateImage({
    prompt: "p",
    size: "1536x1024",
    apiKey: "k",
    model: "1.5",
    client,
  });

  assert.equal(seen.model, "gpt-image-1.5");
  assert.equal(seen.size, "1536x1024");
  assert.equal(seen.prompt, "p");
  assert.equal(seen.n, 1);
});

test("surfaces an SDK error as its message, and keeps the detail in the log", async () => {
  const client = {
    images: {
      generate: async () => {
        throw new Error("Billing hard limit reached");
      },
    },
  };

  const log = quietLog();

  await assert.rejects(
    () =>
      generateImage({ prompt: "p", size: "1024x1024", apiKey: "k", client, log }),
    /Billing hard limit/
  );

  assert.ok(log.said(/Billing hard limit/), "the reason is written down");
  assert.ok(log.said(/gpt-image-1\.5/), "beside which model refused");
  assert.ok(log.said(/1024x1024/), "and at what size");
});

test("falls back to downloading the image URL when there is no b64_json", async () => {
  const origFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    arrayBuffer: async () => Buffer.from("REMOTE"),
  });
  try {
    const client = fakeClient({ data: [{ url: "https://example.test/img.png" }] });
    const out = await generateImage({
      prompt: "p",
      size: "1024x1024",
      apiKey: "k",
      client,
    });
    assert.deepEqual(out.images[0].bytes, Buffer.from("REMOTE"));
  } finally {
    global.fetch = origFetch;
  }
});

test("generateImage returns the usage the API reported", async () => {
  const png = Buffer.from("PNGBYTES");
  const client = {
    images: {
      generate: async () => ({
        data: [{ b64_json: png.toString("base64") }],
        usage: {
          input_tokens: 15,
          input_tokens_details: { text_tokens: 15, image_tokens: 0 },
          output_tokens: 1250,
          output_tokens_details: { text_tokens: 194, image_tokens: 1056 },
          total_tokens: 1265,
        },
      }),
    },
  };

  const result = await generateImage({
    prompt: "a blue sky",
    size: "1024x1024",
    apiKey: "sk-test",
    model: "1.5",
    client,
  });

  assert.equal(result.usage.total, 1265);
  assert.equal(result.usage.outputText, 194);
  assert.equal(result.usage.outputImage, 1056);
});

test("generateImage still works when the API reports no usage", async () => {
  const png = Buffer.from("PNGBYTES");
  const client = {
    images: {
      generate: async () => ({ data: [{ b64_json: png.toString("base64") }] }),
    },
  };

  const result = await generateImage({
    prompt: "a blue sky",
    size: "1024x1024",
    apiKey: "sk-test",
    model: "1.5",
    client,
  });

  assert.equal(result.usage, null);
  assert.ok(result.images[0].bytes.length > 0, "the image still comes back");
});

const { editImage } = require("../../../services/openai");

test("returns every image the API sent back", async () => {
  const first = Buffer.from("ONE").toString("base64");
  const second = Buffer.from("TWO").toString("base64");
  const client = fakeClient({
    data: [{ b64_json: first }, { b64_json: second }],
    usage: { total_tokens: 100, input_tokens: 40, output_tokens: 60 },
  });

  const out = await generateImage({
    prompt: "a cat",
    size: "1024x1024",
    apiKey: "k",
    model: "2",
    n: 2,
    client,
  });

  assert.equal(out.images.length, 2);
  assert.deepEqual(out.images[0].bytes, Buffer.from("ONE"));
  assert.deepEqual(out.images[1].bytes, Buffer.from("TWO"));
  assert.equal(out.images[1].dataUrl, `data:image/png;base64,${second}`);
  assert.equal(out.usage.total, 100, "one usage figure for the whole call");
});

test("uses what arrived when the API sends fewer than asked for", async () => {
  const only = Buffer.from("ONE").toString("base64");
  const client = fakeClient({ data: [{ b64_json: only }] });

  const out = await generateImage({
    prompt: "a cat",
    size: "1024x1024",
    apiKey: "k",
    n: 4,
    client,
  });

  assert.equal(out.images.length, 1);
});

test("an empty reply is still an error", async () => {
  const client = fakeClient({ data: [] });

  await assert.rejects(
    () =>
      generateImage({ prompt: "a cat", size: "1024x1024", apiKey: "k", client }),
    /returned no image/
  );
});

test("an edit still answers in its single-image shape", async () => {
  const b64 = Buffer.from("EDIT").toString("base64");
  const client = {
    images: { edit: async () => ({ data: [{ b64_json: b64 }] }) },
  };

  const out = await editImage({
    prompt: "make it blue",
    size: "1024x1024",
    apiKey: "k",
    imageBytes: Buffer.from("src"),
    maskBytes: Buffer.from("mask"),
    client,
  });

  assert.deepEqual(out.bytes, Buffer.from("EDIT"));
  assert.equal(out.dataUrl, `data:image/png;base64,${b64}`);
  assert.equal(out.images, undefined, "no list on the edit result");
});
