/**
 * The compare slider says what it does
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const VIEW = path.join(__dirname, "..", "..", "..", "views", "compare.ejs");
const WIPE = path.join(__dirname, "..", "..", "..", "public", "js", "wipe.js");

test("the slider is labelled as how much of the original shows", () => {
  const slider = /<input[^>]*id="slider"[^>]*>/.exec(
    fs.readFileSync(VIEW, "utf8")
  )[0];
  assert.match(slider, /aria-label="How much of the original to show"/);
});

test("and that is what it does: at 100 the edit is clipped away entirely", () => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(WIPE, "utf8"), sandbox);
  assert.equal(sandbox.window.ImageForgeWipe.clipFor(100), "inset(0 0 0 100%)");
});
