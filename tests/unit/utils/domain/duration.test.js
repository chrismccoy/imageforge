/**
 * Generation duration tests
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { durationMs, formatDuration } = require("../../../../utils/domain/duration");

test("durationMs keeps whole non-negative milliseconds", () => {
  assert.equal(durationMs(8421), 8421);
  assert.equal(durationMs(8421.6), 8422);
  assert.equal(durationMs(0), 0);
});

test("durationMs refuses anything that is not a time", () => {
  assert.equal(durationMs(null), null);
  assert.equal(durationMs(undefined), null);
  assert.equal(durationMs(-1), null);
  assert.equal(durationMs(NaN), null);
  assert.equal(durationMs(Infinity), null);
  assert.equal(durationMs("8421"), null);
});

test("under ten seconds shows tenths", () => {
  assert.equal(formatDuration(8421), "8.4s");
  assert.equal(formatDuration(450), "0.5s");
  assert.equal(formatDuration(9940), "9.9s");
});

test("ten seconds up to a minute shows whole seconds", () => {
  assert.equal(formatDuration(9960), "10s");
  assert.equal(formatDuration(42300), "42s");
  assert.equal(formatDuration(59400), "59s");
});

test("a minute or more shows minutes and padded seconds", () => {
  assert.equal(formatDuration(59600), "1m 00s");
  assert.equal(formatDuration(65000), "1m 05s");
  assert.equal(formatDuration(754000), "12m 34s");
});

test("no time formats as null", () => {
  assert.equal(formatDuration(null), null);
  assert.equal(formatDuration(undefined), null);
  assert.equal(formatDuration(-5), null);
});
