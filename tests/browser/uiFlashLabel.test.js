/**
 * flashLabel / resetLabel
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const FILE = path.join(__dirname, "..", "..", "public", "js", "ui.js");

function loadUi() {
  const sandbox = { window: {}, console, setTimeout, clearTimeout };
  vm.runInNewContext(fs.readFileSync(FILE, "utf8"), sandbox);
  return sandbox.window.ImageForgeUi;
}

function stubButton(innerHTML) {
  return { innerHTML, textContent: "" };
}

function afterFlash(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms + 10));
}

test("flashLabel restores a button's icon, not just its words", async () => {
  const ui = loadUi();
  const original = '<i class="fa-solid fa-link" aria-hidden="true"></i> Share Link';
  const btn = stubButton(original);

  ui.flashLabel(btn, "Copied", 15);
  assert.equal(btn.textContent, "Copied", "the flash text shows immediately");

  await afterFlash(15);
  assert.equal(btn.innerHTML, original, "the icon and label both come back");
});

test("resetLabel restores a button's icon immediately", async () => {
  const ui = loadUi();
  const original =
    '<i class="fa-regular fa-image" aria-hidden="true"></i> Share Image';
  const btn = stubButton(original);

  ui.flashLabel(btn, "Copied", 5000);
  assert.equal(btn.textContent, "Copied");

  ui.resetLabel(btn);
  assert.equal(btn.innerHTML, original, "restored without waiting for the timer");
});

test("a second flash before the first clears still restores the original", async () => {
  const ui = loadUi();
  const original = '<i class="fa-solid fa-link" aria-hidden="true"></i> Share Link';
  const btn = stubButton(original);

  ui.flashLabel(btn, "Copied", 15);
  ui.flashLabel(btn, "Copied", 15);

  await afterFlash(15);
  assert.equal(btn.innerHTML, original);
});

test("a text-only button still restores its plain label", async () => {
  const ui = loadUi();
  const btn = stubButton("Copy");

  ui.flashLabel(btn, "Copied", 15);
  assert.equal(btn.textContent, "Copied");

  await afterFlash(15);
  assert.equal(btn.innerHTML, "Copy");
});
