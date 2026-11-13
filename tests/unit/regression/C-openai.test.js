/**
 * The image service tags its failures, and bounds a download by URL
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");

const { generateImage, editImage } = require("../../../services/openai");
const { quietLog } = require("../../helpers/quietLog");

const CAP = 64 * 1024 * 1024;
const CHUNK = 1024 * 1024;

function failingClient(status) {
  return {
    images: {
      generate: async () => {
        throw Object.assign(new Error(`${status} upstream said no`), { status });
      },
    },
  };
}

function urlClient() {
  return {
    images: {
      generate: async () => ({ data: [{ url: "https://images.example/x.png" }] }),
    },
  };
}

function ask(client) {
  return generateImage({
    prompt: "a cat",
    size: "1024x1024",
    apiKey: "k",
    model: "2",
    client,
    log: quietLog(),
  });
}

async function withFetch(fake, run) {
  const real = global.fetch;
  global.fetch = fake;
  try {
    return await run();
  } finally {
    global.fetch = real;
  }
}

function streamOf(total) {
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (sent >= total) return controller.close();
      const size = Math.min(CHUNK, total - sent);
      sent += size;
      controller.enqueue(new Uint8Array(size));
    },
  });
}

test("validation failures are shown as 400s", async () => {
  await assert.rejects(
    () => generateImage({ prompt: "a cat", size: "1024x1024", apiKey: "" }),
    { status: 400, expose: true }
  );
  await assert.rejects(
    () => generateImage({ prompt: " ", size: "1024x1024", apiKey: "k" }),
    { status: 400, expose: true }
  );
  await assert.rejects(
    () => editImage({ prompt: "a cat", apiKey: "k", imageBytes: null }),
    { status: 400, expose: true }
  );
});

test("an upstream rate limit is a 503, anything else upstream a 502", async () => {
  await assert.rejects(() => ask(failingClient(429)), {
    status: 503,
    expose: true,
  });
  await assert.rejects(() => ask(failingClient(500)), {
    status: 502,
    expose: true,
  });
});

test("an image fetched by URL is fetched with a timeout", async () => {
  let init = null;
  await withFetch(
    async (_url, given) => {
      init = given;
      return new Response(new Uint8Array([1, 2, 3]));
    },
    () => ask(urlClient())
  );
  assert.ok(init && init.signal instanceof AbortSignal, "a signal is passed");
});

test("an image whose stated length is over the cap is refused", async () => {
  const body = new Uint8Array([1, 2, 3]);
  await assert.rejects(
    () =>
      withFetch(
        async () =>
          new Response(body, { headers: { "content-length": String(CAP + 1) } }),
        () => ask(urlClient())
      ),
    { status: 502, message: /too large/ }
  );
});

test("an image that streams past the cap is refused", async () => {
  await assert.rejects(
    () =>
      withFetch(
        async () => new Response(streamOf(CAP + CHUNK)),
        () => ask(urlClient())
      ),
    { status: 502, message: /too large/ }
  );
});

test("an image under the cap still comes through", async () => {
  const out = await withFetch(
    async () => new Response(streamOf(3 * CHUNK)),
    () => ask(urlClient())
  );
  assert.equal(out.images[0].bytes.length, 3 * CHUNK);
});
