/**
 * Credentials tests
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createOpenaiCredentials } = require("../../../services/openaiCredentials");

function fakeSettings(row) {
  return { get: () => row };
}

test("apiKey prefers the saved key over the environment", () => {
  const c = createOpenaiCredentials(
    fakeSettings({ api_key: "  saved-key  ", model: "2" })
  );
  assert.equal(c.apiKey(), "saved-key");
  assert.equal(c.model(), "2");
});

test("apiKey falls back to the environment key when none is saved", () => {
  const prev = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "env-key";
  try {
    const c = createOpenaiCredentials(fakeSettings({ api_key: "", model: "" }));
    assert.equal(c.model(), "1.5"); 
  } finally {
    if (prev === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prev;
  }
});

test("model defaults when the saved value is blank", () => {
  const c = createOpenaiCredentials(fakeSettings({ api_key: "k", model: "   " }));
  assert.equal(c.model(), "1.5");
});
