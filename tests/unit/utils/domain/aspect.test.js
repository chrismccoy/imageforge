/**
 * Aspect ratios
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");

const { aspectsFrom } = require("../../../../utils/domain/aspect");
const { ALLOWED_SIZES } = require("../../../../config/images");

test("a square size reads as one to one", () => {
  assert.deepEqual(aspectsFrom(["1024x1024"]), [{ label: "1:1", ratio: 1 }]);
});

test("a tall size is reduced to its smallest whole numbers", () => {
  const [tall] = aspectsFrom(["1024x1536"]);
  assert.equal(tall.label, "2:3");
  assert.equal(Number(tall.ratio.toFixed(4)), 0.6667);
});

test("a wide size is the same the other way up", () => {
  const [wide] = aspectsFrom(["1536x1024"]);
  assert.equal(wide.label, "3:2");
  assert.equal(Number(wide.ratio.toFixed(4)), 1.5);
});

test("auto is not a shape, so it is not offered", () => {
  assert.deepEqual(aspectsFrom(["auto"]), []);
});

test("two sizes of the same shape are offered once", () => {
  assert.equal(aspectsFrom(["1024x1024", "512x512"]).length, 1);
});

test("anything that is not a size is skipped rather than breaking the row", () => {
  assert.deepEqual(aspectsFrom(["", "wide", "0x0", null, undefined]), []);
});

test("the app's own sizes give the three shapes it generates", () => {
  assert.deepEqual(
    aspectsFrom(ALLOWED_SIZES).map((shape) => shape.label),
    ["1:1", "2:3", "3:2"]
  );
});
