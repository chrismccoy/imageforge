/**
 * Spend model tests
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const { buildModels, initSchema } = require("../../../models");

function models() {
  return buildModels(initSchema(new Database(":memory:")));
}

const USAGE = {
  total: 100,
  input: 40,
  output: 60,
  inputText: 20,
  inputImage: 20,
  outputText: 30,
  outputImage: 30,
};

test("recordGenerated reports how many images it recorded", () => {
  const { Spend } = models();
  assert.equal(Spend.recordGenerated({ model: "gpt-image-2", images: 4 }), 4);
});

test("recordGenerated adds a batch's images and its whole usage", () => {
  const { Spend, Stats } = models();

  Spend.recordGenerated({ model: "gpt-image-2", usage: USAGE, images: 4 });

  const [row] = Stats.byModel();
  assert.equal(row.model, "gpt-image-2");
  assert.equal(row.images, 4);
  assert.equal(row.totalTokens, 100, "the figure the API reported, undivided");
  assert.equal(row.inputTokens, 40);
  assert.equal(row.outputTokens, 60);
});

test("recordGenerated accumulates across calls", () => {
  const { Spend, Stats } = models();

  Spend.recordGenerated({ model: "gpt-image-2", usage: USAGE, images: 2 });
  Spend.recordGenerated({ model: "gpt-image-2", usage: USAGE, images: 1 });

  const [row] = Stats.byModel();
  assert.equal(row.images, 3);
  assert.equal(row.totalTokens, 200);
});

test("a call that reported no usage still counts its images", () => {
  const { Spend, Stats } = models();

  Spend.recordGenerated({ model: "gpt-image-2", images: 2 });

  const [row] = Stats.byModel();
  assert.equal(row.images, 2);
  assert.equal(row.countedImages, 0, "nothing to count tokens from");
  assert.equal(row.totalTokens, 0);
});

test("a batch of no images records nothing", () => {
  const { Spend, Stats } = models();

  assert.equal(Spend.recordGenerated({ model: "gpt-image-2", images: 0 }), 0);
  assert.deepEqual(Stats.byModel(), []);
});

test("recording one model leaves another alone", () => {
  const { Spend, Stats } = models();

  Spend.recordGenerated({ model: "gpt-image-2", usage: USAGE, images: 4 });
  Spend.recordGenerated({ model: "gpt-image-1.5", usage: USAGE, images: 1 });

  const byModel = Object.fromEntries(
    Stats.byModel().map((row) => [row.model, row.images])
  );
  assert.equal(byModel["gpt-image-2"], 4);
  assert.equal(byModel["gpt-image-1.5"], 1);
});

test("what the application records and what the trigger records add up", () => {
  const built = models();

  built.Spend.recordGenerated({
    model: "gpt-image-2",
    usage: USAGE,
    images: 4,
  });
  built.Generation.add({
    filename: "kept.png",
    model: "gpt-image-2",
    spend_counted: 1,
  });

  built.Generation.add({ filename: "uploaded.png", model: "gpt-image-2" });

  const [row] = built.Stats.byModel();
  assert.equal(row.images, 5, "four generated plus one uploaded, counted once");
});
