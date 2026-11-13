"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { parseId, parseFlag } = require("../../../utils/domain/coerce");

test("parseId accepts only canonical positive integers", () => {
  assert.strictEqual(parseId("7"), 7);
  assert.strictEqual(parseId(7), 7);
  for (const bad of [
    "0x1F",
    "1e2",
    " 7 ",
    ["5"],
    "07",
    "0",
    "-1",
    "1.5",
    "",
    null,
  ]) {
    assert.strictEqual(parseId(bad), null, String(bad));
  }
});

test("parseFlag treats false-like values as off", () => {
  for (const off of [
    false,
    0,
    "",
    "0",
    "false",
    "off",
    "no",
    " ",
    undefined,
    null,
  ]) {
    assert.strictEqual(parseFlag(off), false, String(off));
  }
  for (const on of [true, 1, "1", "true", "on", "yes"]) {
    assert.strictEqual(parseFlag(on), true, String(on));
  }
});
