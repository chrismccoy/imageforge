/**
 * Search tests
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");

const { likePattern } = require("../../../../utils/domain/search");

test("a plain word matches anywhere in the text", () => {
  assert.equal(likePattern("tokyo"), "%tokyo%");
});

test("surrounding whitespace is trimmed", () => {
  assert.equal(likePattern("  tokyo  "), "%tokyo%");
});

test("nothing to search for gives no pattern", () => {
  assert.equal(likePattern(""), null);
  assert.equal(likePattern("   "), null);
  assert.equal(likePattern(null), null);
  assert.equal(likePattern(undefined), null);
});

test("a percent sign is matched literally, not as a wildcard", () => {
  assert.equal(likePattern("100%"), "%100\\%%");
});

test("an underscore is matched literally, not as any-single-character", () => {
  assert.equal(likePattern("a_b"), "%a\\_b%");
});

test("a backslash is escaped so it cannot escape the next character", () => {
  assert.equal(likePattern("back\\slash"), "%back\\\\slash%");
});

test("a term of nothing but wildcards is still a literal search", () => {
  assert.equal(likePattern("%_%"), "%\\%\\_\\%%");
});

test("a term is not lowercased, since LIKE is already case-insensitive", () => {
  assert.equal(likePattern("Tokyo"), "%Tokyo%");
});
