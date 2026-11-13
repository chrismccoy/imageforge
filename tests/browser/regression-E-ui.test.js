/**
 * setStatus keeps the element's own classes
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const FILE = path.join(__dirname, "..", "..", "public", "js", "ui.js");

function load() {
  const sandbox = { window: {}, WeakMap, setTimeout, clearTimeout };
  vm.runInNewContext(fs.readFileSync(FILE, "utf8"), sandbox);
  return sandbox.window.ImageForgeUi;
}

function element(className) {
  const classes = new Set(className.split(" ").filter(Boolean));
  return {
    textContent: "",
    classList: {
      add: (...names) => names.forEach((n) => classes.add(n)),
      remove: (...names) => names.forEach((n) => classes.delete(n)),
      contains: (n) => classes.has(n),
    },
    get className() {
      return Array.from(classes).join(" ");
    },
    set className(value) {
      classes.clear();
      value
        .split(" ")
        .filter(Boolean)
        .forEach((n) => classes.add(n));
    },
  };
}

test("a status keeps the classes the page gave it, and swaps only the colour", () => {
  const ui = load();
  const el = element("min-h-5 break-words text-sm");

  ui.setStatus(el, "Oops", "error");
  assert.equal(el.textContent, "Oops");
  assert.ok(el.classList.contains("break-words"), "break-words survives");
  assert.ok(el.classList.contains("text-red-600"));

  ui.setStatus(el, "Done", "success");
  assert.ok(el.classList.contains("text-green-600"));
  assert.ok(!el.classList.contains("text-red-600"), "old colour is dropped");
  assert.ok(el.classList.contains("break-words"));

  ui.setStatus(el, "");
  assert.ok(el.classList.contains("text-slate-500"));
  assert.ok(!el.classList.contains("text-green-600"));
});
