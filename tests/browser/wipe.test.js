/**
 * Wipe slider tests
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const FILE = path.join(__dirname, "..", "..", "public", "js", "wipe.js");

function load() {
  const sandbox = { window: {}, console };
  vm.runInNewContext(fs.readFileSync(FILE, "utf8"), sandbox);
  return sandbox.window.ImageForgeWipe;
}

test("the slider is the seam: what is on the left is what came first", () => {
  const { clipFor } = load();

  assert.equal(clipFor(0), "inset(0 0 0 0%)", "seam at the far left: all after");
  assert.equal(clipFor(50), "inset(0 0 0 50%)", "the after is the right half");
  assert.equal(clipFor(100), "inset(0 0 0 100%)", "seam at the far right");
});

test("a slider position that makes no sense is held to the ends", () => {
  const { clipFor } = load();

  assert.equal(clipFor(-20), "inset(0 0 0 0%)");
  assert.equal(clipFor(500), "inset(0 0 0 100%)");
  assert.equal(clipFor("nonsense"), "inset(0 0 0 50%)", "back to the middle");
});

test("the seam and the handle cannot drift apart", () => {
  const { clipFor, handleFor } = load();

  for (const at of [0, 17, 50, 83, 100]) {
    assert.equal(clipFor(at), `inset(0 0 0 ${handleFor(at)})`, `at ${at}`);
  }
  assert.equal(handleFor("nonsense"), "50%");
});
