/**
 * OpenAI error reporting tests
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  describeUpstreamError,
  makeLoggingFetch,
} = require("../../../services/openai");

test("a JSON parse failure becomes a message about the service", () => {
  const message = describeUpstreamError(
    new SyntaxError(`Unexpected token '<', "<html> <h"... is not valid JSON`)
  );
  assert.match(message, /image service/i);
  assert.equal(message.includes("Unexpected token"), false);
});

test("the status is named when the error carries one", () => {
  const err = new SyntaxError("Unexpected token '<' is not valid JSON");
  err.status = 504;
  assert.match(describeUpstreamError(err), /504/);
});

test("an ordinary API error keeps its own message", () => {
  const err = new Error("Your prompt was rejected by the safety system.");
  assert.equal(
    describeUpstreamError(err),
    "Your prompt was rejected by the safety system."
  );
});

test("an error with no message still says something", () => {
  assert.match(describeUpstreamError(new Error("")), /image request failed/i);
});

test("the logging fetch records a non-JSON reply and passes it through", async () => {
  const lines = [];
  const inner = async () =>
    new Response("<html> <head><title>504 Gateway Time-out</title></head>", {
      status: 504,
      headers: { "content-type": "text/html" },
    });

  const wrapped = makeLoggingFetch(inner, (line) => lines.push(line));
  const res = await wrapped("https://api.openai.com/v1/images/generations", {});

  assert.equal(res.status, 504);
  assert.match(await res.text(), /Gateway Time-out/);

  assert.equal(lines.length, 1);
  assert.match(lines[0], /504/);
  assert.match(lines[0], /text\/html/);
  assert.match(lines[0], /Gateway Time-out/);
});

test("the logging fetch stays quiet on a JSON reply", async () => {
  const lines = [];
  const inner = async () =>
    new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const wrapped = makeLoggingFetch(inner, (line) => lines.push(line));
  const res = await wrapped("https://api.openai.com/v1/images/generations", {});

  assert.deepEqual(await res.json(), { data: [] });
  assert.deepEqual(lines, []);
});
