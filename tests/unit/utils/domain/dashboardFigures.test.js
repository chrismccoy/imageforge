/**
 * The dashboard's figures
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildOutputChart } = require("../../../../utils/domain/outputChart");
const { costedModels } = require("../../../../utils/domain/cost");
const { storageFigures } = require("../../../../utils/domain/storage");

const MODEL = "gpt-image-1.5";
const PRICES = { [MODEL]: { input: 5, output: 40 } };
const MILLION = 1000000;

function day(date, images, model = MODEL, tokens = 0) {
  return {
    day: date,
    model,
    images,
    inputTokens: tokens,
    outputTokens: tokens,
  };
}

test("a quiet day still draws a bar against a busy one", () => {
  const chart = buildOutputChart(
    [day("2026-08-01", 200), day("2026-08-02", 1)],
    PRICES,
    { days: 2, height: 96 }
  );

  assert.equal(chart.bars[0].height, 96, "the busiest day fills the chart");
  assert.ok(chart.bars[1].height >= 1, "one image is still visible");
});

test("a day with no images draws no bar", () => {
  const chart = buildOutputChart(
    [day("2026-08-01", 10), day("2026-08-02", 0)],
    PRICES,
    { days: 2, height: 96 }
  );

  assert.equal(chart.bars[1].height, 0);
});

test("two models on one day are one bar", () => {
  const chart = buildOutputChart(
    [day("2026-08-01", 3), day("2026-08-01", 2, "gpt-image-2")],
    PRICES,
    { days: 1, height: 96 }
  );

  assert.equal(chart.bars.length, 1);
  assert.equal(chart.bars[0].images, 5);
  assert.equal(chart.images, 5);
});

test("an unpriced model adds images but no money", () => {
  const chart = buildOutputChart(
    [day("2026-08-01", 4, "gpt-image-2", MILLION)],
    PRICES,
    { days: 1, height: 96 }
  );

  assert.equal(chart.images, 4);
  assert.equal(chart.spend, null, "nothing priced is nothing to report");
});

test("a priced day reports what it cost", () => {
  const chart = buildOutputChart([day("2026-08-01", 1, MODEL, MILLION)], PRICES, {
    days: 1,
    height: 96,
  });

  assert.equal(chart.spend, "$45.00");
});

test("the per-day average is over the whole window", () => {
  const chart = buildOutputChart([day("2026-08-01", 30)], PRICES, {
    days: 30,
    height: 96,
  });

  assert.equal(chart.perDay, "1.0");
});

test("an empty window reports nothing rather than dividing", () => {
  const chart = buildOutputChart([], PRICES, { days: 30, height: 96 });

  assert.deepEqual(chart.bars, []);
  assert.equal(chart.images, 0);
  assert.equal(chart.perDay, "0");
  assert.equal(chart.spend, null);
});

function group(model, images, countedImages, tokens = 0) {
  return {
    model,
    images,
    countedImages,
    inputTokens: tokens,
    outputTokens: tokens,
    totalTokens: tokens * 2,
  };
}

test("a group that counted nothing reports nothing, not zero", () => {
  const [row] = costedModels([group(MODEL, 5, 0)], PRICES);

  assert.equal(row.cost, null);
  assert.equal(row.rawCost, null);
  assert.equal(row.tokens, null);
});

test("a group that counted everything reports what it cost", () => {
  const [row] = costedModels([group(MODEL, 1, 1, MILLION)], PRICES);

  assert.equal(row.cost, "$45.00");
  assert.equal(row.rawCost, 45);
  assert.equal(row.tokens, "2,000,000");
});

test("images with no model read as uploads", () => {
  const [row] = costedModels([group("", 3, 0)], PRICES);

  assert.equal(row.label, "uploaded");
});

test("a partly counted group says so", () => {
  const [some] = costedModels([group(MODEL, 4, 2, MILLION)], PRICES);
  const [all] = costedModels([group(MODEL, 4, 4, MILLION)], PRICES);
  const [none] = costedModels([group(MODEL, 4, 0)], PRICES);

  assert.equal(some.partial, true);
  assert.equal(all.partial, false);
  assert.equal(none.partial, false, "nothing counted is not partly counted");
});

test("a folder past its quota shows a full bar, not more", () => {
  const over = storageFigures(150, 100);

  assert.equal(over.percent, 100);
  assert.equal(over.used, "150 B");
  assert.equal(over.quota, "100 B");
});

test("the percentage is rounded", () => {
  assert.equal(storageFigures(1, 3).percent, 33);
  assert.equal(storageFigures(2, 3).percent, 67);
  assert.equal(storageFigures(0, 100).percent, 0);
});

test("a quota of nothing reads as full", () => {
  assert.equal(storageFigures(10, 0).percent, 100);
});
