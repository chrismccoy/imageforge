/**
 * Production config tests
 */

"use strict";

process.env.NODE_ENV = "production";
process.env.SESSION_SECRET = "a-long-random-production-secret";
process.env.ADMIN_PASSWORD = "a-real-password";

const test = require("node:test");
const assert = require("node:assert/strict");

function freshConfigProblems() {
  delete require.cache[require.resolve("../../../config/env")];
  delete require.cache[require.resolve("../../../utils/security/secretBox")];
  return require("../../../config/env").configProblems();
}

test("production without SETTINGS_ENC_KEY is refused", () => {
  process.env.SETTINGS_ENC_KEY = "";
  const problems = freshConfigProblems();
  assert.ok(
    problems.some((m) => /SETTINGS_ENC_KEY must be set in production/.test(m)),
    "missing encryption key should be a production config problem"
  );
  assert.equal(problems.length, 1);
});

test("production with a valid SETTINGS_ENC_KEY passes", () => {
  process.env.SETTINGS_ENC_KEY = "a".repeat(64); 
  const problems = freshConfigProblems();
  assert.deepEqual(problems, []);
});

test("an invalid SETTINGS_ENC_KEY is rejected on shape, not just presence", () => {
  process.env.SETTINGS_ENC_KEY = "too-short";
  const problems = freshConfigProblems();
  assert.ok(problems.some((m) => /SETTINGS_ENC_KEY must be 32 bytes/.test(m)));
});
