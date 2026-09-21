/**
 * Cost tests
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");

const { costFrom, costOf, formatCost } = require("../../../../utils/domain/cost");

const PRICE = { input: 10, output: 40 };

test("cost is the two rates applied per million tokens", () => {
  assert.equal(costFrom(1000000, 500000, PRICE), 30);
  assert.equal(costFrom(2000000, 0, PRICE), 20);
  assert.ok(Math.abs(costFrom(15, 1250, PRICE) - 0.05015) < 1e-9);
});

test("a free model costs nothing, which is not the same as unknown", () => {
  assert.equal(costFrom(1000, 2000, { input: 0, output: 0 }), 0);
});

test("no price means no cost", () => {
  assert.equal(costFrom(100, 200, null), null);
  assert.equal(costFrom(100, 200, undefined), null);
  assert.equal(costFrom(100, 200, {}), null);
});

test("a missing token count means no cost, even with a price", () => {
  assert.equal(costFrom(null, 200, PRICE), null);
  assert.equal(costFrom(100, null, PRICE), null);
  assert.equal(costFrom(undefined, undefined, PRICE), null);
  assert.equal(costFrom("100", 200, PRICE), null);
  assert.equal(costFrom(NaN, 200, PRICE), null);
});

test("costOf reads the counts off a generation row", () => {
  assert.equal(
    costOf({ usage_input_tokens: 1000000, usage_output_tokens: 0 }, PRICE),
    10
  );
  assert.equal(
    costOf({ usage_input_tokens: null, usage_output_tokens: 5 }, PRICE),
    null
  );
  assert.equal(costOf({}, PRICE), null);
  assert.equal(costOf(null, PRICE), null);
});

test("formatting shows enough digits to be useful", () => {
  assert.equal(formatCost(0), "$0.00");
  assert.equal(formatCost(0.011), "$0.011");
  assert.equal(formatCost(0.42), "$0.420");
  assert.equal(formatCost(1.9), "$1.90");
  assert.equal(formatCost(12.3456), "$12.35");
});

test("formatting refuses anything that is not a cost", () => {
  assert.equal(formatCost(null), null);
  assert.equal(formatCost(undefined), null);
  assert.equal(formatCost("1"), null);
  assert.equal(formatCost(NaN), null);
  assert.equal(formatCost(Infinity), null);
  assert.equal(formatCost(-1), null);
});
