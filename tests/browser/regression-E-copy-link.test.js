/**
 * Copy buttons on a page that does not load ui.js
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const FILE = path.join(__dirname, "..", "..", "public", "js", "copy-link.js");

function load(clipboard) {
  const btn = {
    innerHTML: "<i></i> Copy link",
    textContent: "Copy link",
    attrs: { "data-copy": "https://example.test/f/T" },
    getAttribute(name) {
      return name in this.attrs ? this.attrs[name] : null;
    },
    setAttribute(name, value) {
      this.attrs[name] = String(value);
    },
    hasAttribute(name) {
      return name in this.attrs;
    },
    removeAttribute(name) {
      delete this.attrs[name];
    },
    addEventListener(evt, handler) {
      if (evt === "click") this.onClick = handler;
    },
  };
  const timers = [];
  const sandbox = {
    document: {
      querySelectorAll: (sel) => (sel === "[data-copy]" ? [btn] : []),
    },
    navigator: { clipboard },
    window: {},
    setTimeout: (fn) => timers.push(fn),
    clearTimeout() {},
    WeakMap,
    console,
  };
  vm.runInNewContext(fs.readFileSync(FILE, "utf8"), sandbox);
  return { btn, timers };
}

test("without ui.js a copy still says Copied, and the label comes back", async () => {
  const { btn, timers } = load({ writeText: async () => {} });

  await btn.onClick();

  assert.equal(btn.textContent, "Copied");
  timers.forEach((fn) => fn());
  assert.equal(btn.innerHTML, "<i></i> Copy link");
});

test("without ui.js a failed copy says so instead of throwing", async () => {
  const { btn } = load(undefined);

  await assert.doesNotReject(() => btn.onClick());
  assert.equal(btn.textContent, "Copy failed");
});
