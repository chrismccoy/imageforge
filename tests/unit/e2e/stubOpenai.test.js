/**
 * Fake image API tests
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const path = require("path");

const { createStub } = require("../../e2e/stub-openai");

const FIXTURES = path.join(__dirname, "..", "..", "e2e", "fixtures");

let server;
let base;
let stub;

test.before(async () => {
  stub = createStub({ fixturesDir: FIXTURES });
  server = http.createServer(stub.handler);
  server.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

test.beforeEach(() => stub.reset());

function generate(body) {
  return fetch(`${base}/v1/images/generations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "gpt-image-1.5",
      prompt: "a cliff",
      n: 1,
      size: "1024x1024",
      ...body,
    }),
  });
}

test("a generation answers with the recorded envelope and real bytes", async () => {
  const res = await generate();

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.data.length, 1);

  const bytes = Buffer.from(body.data[0].b64_json, "base64");
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(bytes.readUInt32BE(16), 1024);
  assert.equal(bytes.readUInt32BE(20), 1024);

  assert.equal(typeof body.usage.total_tokens, "number");
  assert.equal(typeof body.usage.input_tokens, "number");
  assert.equal(typeof body.usage.output_tokens, "number");
  assert.equal(typeof body.usage.input_tokens_details.text_tokens, "number");
  assert.equal(typeof body.usage.output_tokens_details.image_tokens, "number");
});

test("the size asked for is the size returned, and auto is a square", async () => {
  const ask = async (size) => {
    const bytes = Buffer.from(
      (await (await generate({ size })).json()).data[0].b64_json,
      "base64"
    );
    return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
  };

  assert.equal(await ask("1024x1536"), "1024x1536");
  assert.equal(await ask("1536x1024"), "1536x1024");
  assert.equal(await ask("auto"), "1024x1024");
});

test("a batch returns one image per n", async () => {
  const body = await (await generate({ n: 4 })).json();
  assert.equal(body.data.length, 4);
});

test("an armed failure applies once and only once", async () => {
  await fetch(`${base}/__stub/fail-next`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: 500 }),
  });

  const failed = await generate();
  assert.equal(failed.status, 500);
  assert.equal(typeof (await failed.json()).error.message, "string");

  assert.equal((await generate()).status, 200);
});

test("a failure can be aimed at one model, leaving the other alone", async () => {
  await fetch(`${base}/__stub/fail-next`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "gpt-image-2", status: 500 }),
  });

  assert.equal((await generate({ model: "gpt-image-1.5" })).status, 200);
  assert.equal((await generate({ model: "gpt-image-2" })).status, 500);
});

test("an edit reads the multipart body and refuses one without an image", async () => {
  const png = Buffer.from("89504e470d0a1a0a", "hex");

  const form = new FormData();
  form.set("model", "gpt-image-1.5");
  form.set("prompt", "a white circle");
  form.set("size", "1024x1024");
  form.set("image", new Blob([png], { type: "image/png" }), "image.png");
  form.set("mask", new Blob([png], { type: "image/png" }), "mask.png");

  const ok = await fetch(`${base}/v1/images/edits`, { method: "POST", body: form });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).data.length, 1);

  const bare = new FormData();
  bare.set("prompt", "a white circle");
  const bad = await fetch(`${base}/v1/images/edits`, { method: "POST", body: bare });
  assert.equal(bad.status, 400);
});

test("an edit records whether a mask travelled with it", async () => {
  const png = Buffer.from("89504e470d0a1a0a", "hex");

  const form = new FormData();
  form.set("model", "gpt-image-1.5");
  form.set("prompt", "a white circle");
  form.set("size", "1024x1024");
  form.set("image", new Blob([png], { type: "image/png" }), "image.png");
  form.set("mask", new Blob([png], { type: "image/png" }), "mask.png");
  await fetch(`${base}/v1/images/edits`, { method: "POST", body: form });

  const log = await (await fetch(`${base}/__stub/requests`)).json();
  assert.equal(log[0].path, "/v1/images/edits");
  assert.equal(log[0].hasMask, true);
});

test("every call is logged, and reset empties the log", async () => {
  await generate({ model: "gpt-image-2", n: 2 });

  const log = await (await fetch(`${base}/__stub/requests`)).json();
  assert.equal(log.length, 1);
  assert.equal(log[0].path, "/v1/images/generations");
  assert.equal(log[0].model, "gpt-image-2");
  assert.equal(log[0].n, 2);

  await fetch(`${base}/__stub/reset`, { method: "POST" });
  assert.deepEqual(await (await fetch(`${base}/__stub/requests`)).json(), []);
});
