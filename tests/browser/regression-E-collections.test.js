/**
 * Collection chips: only the latest answer is painted
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const FILE = path.join(__dirname, "..", "..", "public", "js", "collections.js");

function element() {
  return {
    attrs: {},
    children: [],
    listeners: {},
    textContent: "",
    value: "",
    setAttribute(name, value) {
      this.attrs[name] = String(value);
    },
    getAttribute(name) {
      return name in this.attrs ? this.attrs[name] : null;
    },
    addEventListener(name, fn) {
      this.listeners[name] = fn;
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
  };
}

function load() {
  const chips = element();
  Object.defineProperty(chips, "textContent", {
    set() {
      chips.children = [];
    },
    get: () => "",
  });
  const picker = element();
  const box = element();
  box.attrs["data-gen-id"] = "7";
  box.querySelector = (sel) =>
    sel === "[data-collection-chips]"
      ? chips
      : sel === "[data-collection-add]"
        ? picker
        : null;

  const waiting = [];
  const sandbox = {
    document: {
      querySelectorAll: (sel) => (sel === "[data-collections]" ? [box] : []),
      createElement: () => element(),
    },
    window: {
      ImageForgeApi: {
        post(url) {
          return new Promise((resolve) => waiting.push({ url, resolve }));
        },
        notice() {},
      },
    },
    console,
  };
  vm.runInNewContext(fs.readFileSync(FILE, "utf8"), sandbox);
  return { chips, picker, waiting };
}

const shown = (chips) =>
  chips.children.map((chip) => chip.getAttribute("data-collection-id")).join(",");
const tick = () => new Promise((done) => setImmediate(done));

test("an older answer that lands last does not paint over the newer one", async () => {
  const page = load();

  page.picker.value = "1";
  page.picker.listeners.change();
  page.picker.value = "2";
  page.picker.listeners.change();
  assert.equal(page.waiting.length, 2);

  page.waiting[1].resolve({
    collections: [
      { id: 1, name: "One" },
      { id: 2, name: "Two" },
    ],
  });
  await tick();
  page.waiting[0].resolve({ collections: [{ id: 1, name: "One" }] });
  await tick();

  assert.equal(shown(page.chips), "1,2");
});
