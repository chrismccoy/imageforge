/**
 * Edit service tests
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const { editImage } = require("../../../services/openai");
const { quietLog } = require("../../helpers/quietLog");

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

function fakeClient(result) {
  const calls = [];
  return {
    calls,
    images: {
      async edit(args) {
        calls.push(args);
        return result;
      },
    },
  };
}

const ok = () => ({ data: [{ b64_json: PNG.toString("base64") }] });

test("the edit goes to the edits endpoint with both files", async () => {
  const client = fakeClient(ok());
  const result = await editImage({
    prompt: "a red hat",
    size: "1024x1024",
    apiKey: "k",
    model: "2",
    imageBytes: PNG,
    maskBytes: PNG,
    client,
  });

  assert.equal(client.calls.length, 1);
  const sent = client.calls[0];
  assert.equal(sent.model, "gpt-image-2", "the token became the full name");
  assert.equal(sent.prompt, "a red hat");
  assert.equal(sent.size, "1024x1024");
  assert.ok(sent.image, "the source went with it");
  assert.ok(sent.mask, "and so did the mask");

  assert.equal(result.model, "gpt-image-2");
  assert.deepEqual(result.bytes, PNG);
  assert.match(result.dataUrl, /^data:image\/png;base64,/);
});

test("no key is refused before any call is made", async () => {
  const client = fakeClient(ok());
  await assert.rejects(
    () =>
      editImage({
        prompt: "p",
        size: "1024x1024",
        apiKey: "",
        imageBytes: PNG,
        maskBytes: PNG,
        client,
      }),
    /No OpenAI API key/
  );
  assert.equal(client.calls.length, 0, "and nothing was sent");
});

test("an empty prompt is refused", async () => {
  const client = fakeClient(ok());
  await assert.rejects(
    () =>
      editImage({
        prompt: "   ",
        size: "1024x1024",
        apiKey: "k",
        imageBytes: PNG,
        maskBytes: PNG,
        client,
      }),
    /prompt is empty/
  );
  assert.equal(client.calls.length, 0);
});

test("a missing image or mask is refused", async () => {
  const client = fakeClient(ok());
  for (const missing of [{ imageBytes: null }, { maskBytes: null }]) {
    await assert.rejects(
      () =>
        editImage(
          Object.assign(
            {
              prompt: "p",
              size: "1024x1024",
              apiKey: "k",
              imageBytes: PNG,
              maskBytes: PNG,
              client,
            },
            missing
          )
        ),
      /image and a mask/
    );
  }
  assert.equal(client.calls.length, 0);
});

test("usage comes back the same way a generation's does", async () => {
  const client = fakeClient({
    data: [{ b64_json: PNG.toString("base64") }],
    usage: {
      total_tokens: 300,
      input_tokens: 200,
      output_tokens: 100,
      input_tokens_details: { text_tokens: 20, image_tokens: 180 },
    },
  });

  const result = await editImage({
    prompt: "p",
    size: "1024x1024",
    apiKey: "k",
    imageBytes: PNG,
    maskBytes: PNG,
    client,
  });

  assert.equal(result.usage.total, 300);
  assert.equal(result.usage.inputImage, 180);
});

test("an upstream failure comes back readable, with the detail kept in the log", async () => {
  const client = {
    images: {
      async edit() {
        const err = new Error("Unexpected token < is not valid JSON");
        err.status = 502;
        throw err;
      },
    },
  };

  const log = quietLog();

  await assert.rejects(
    () =>
      editImage({
        prompt: "p",
        size: "1024x1024",
        apiKey: "k",
        imageBytes: PNG,
        maskBytes: PNG,
        client,
        log,
      }),
    /unreadable response \(status 502\)/
  );

  assert.ok(log.said(/not valid JSON/), "the raw reason is written down");
});

test("no image in the reply is an error, not an empty save", async () => {
  const client = fakeClient({ data: [] });
  await assert.rejects(
    () =>
      editImage({
        prompt: "p",
        size: "1024x1024",
        apiKey: "k",
        imageBytes: PNG,
        maskBytes: PNG,
        client,
      }),
    /returned no image/
  );
});
