/**
 * The generate page's batch
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const FILE = path.join(__dirname, "..", "..", "public", "js", "generate-batch.js");

function load() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(FILE, "utf8"), sandbox);
  return sandbox.window.ImageForgeGenerateBatch;
}

const { batchFrom, picked, saveLabel, waitingFor, missingNote, saveSummary } =
  load();

function image(n) {
  return { token: "t" + n, url: "data:," + n, model: "gpt-image-1.5" };
}

test("one image arrives already picked", () => {
  const [only] = batchFrom([image(1)], false);
  assert.equal(only.selected, true);
});

test("several images arrive picked by nobody", () => {
  const batch = batchFrom([image(1), image(2), image(3)], false);
  assert.deepEqual(
    batch.map((item) => item.selected),
    [false, false, false]
  );
});

test("the model is named only when the batch is a comparison", () => {
  assert.equal(batchFrom([image(1), image(2)], false)[0].showModel, false);
  assert.equal(batchFrom([image(1), image(2)], true)[0].showModel, true);
});

test("an answer with no images is an empty batch, not a crash", () => {
  assert.equal(batchFrom(undefined, false).length, 0);
  assert.equal(batchFrom([], true).length, 0);
});

test("a picked tile whose token is spent is no longer saveable", () => {
  const batch = batchFrom([image(1), image(2)], false);
  batch[0].selected = true;
  batch[1].selected = true;
  batch[1].token = null;

  assert.deepEqual(
    picked(batch).map((item) => item.url),
    ["data:,1"]
  );
});

test("the Save button counts only when there is a choice", () => {
  assert.equal(saveLabel(0), "Save");
  assert.equal(saveLabel(1), "Save");
  assert.equal(saveLabel(3), "Save 3 selected");
});

test("the spinner says how many are coming", () => {
  assert.equal(waitingFor(1), "Generating your image");
  assert.equal(waitingFor(4), "Generating your 4 images");
});

test("a model that did not answer is named", () => {
  assert.equal(
    missingNote([{ model: "gpt-image-2", message: "boom" }]),
    "gpt-image-2 did not answer."
  );
  assert.match(
    missingNote([{ model: "a" }, { model: "b" }]),
    /a did not answer\. b did not answer\./
  );
});

test("nothing missing is said with nothing", () => {
  assert.equal(missingNote([]), "");
  assert.equal(missingNote(undefined), "");
});

test("a partly saved batch reports both halves", () => {
  const said = saveSummary(3, 1);

  assert.equal(said.message, "Saved 3. 1 could not be saved.");
  assert.equal(said.kind, "error");
  assert.equal(said.viewLink, true, "three images did save; offer the way there");
});

test("a batch that saved nothing offers nowhere to go", () => {
  const said = saveSummary(0, 2);

  assert.equal(said.message, "Nothing could be saved.");
  assert.equal(said.kind, "error");
  assert.equal(said.viewLink, false);
});

test("a batch that saved counts itself only when it is more than one", () => {
  assert.equal(saveSummary(1, 0).message, "Saved.");
  assert.equal(saveSummary(4, 0).message, "Saved 4 images.");
  assert.equal(saveSummary(4, 0).kind, "success");
});
