/**
 * Copy-to-clipboard button tests
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const FILE = path.join(__dirname, "..", "..", "public", "js", "copy-link.js");

function stubButton(url) {
  return {
    attrs: { "data-copy": url },
    getAttribute(name) {
      return this.attrs[name];
    },
    addEventListener(evt, handler) {
      if (evt === "click") this.onClick = handler;
    },
  };
}

function load(btn, clipboard) {
  const flashes = [];
  const sandbox = {
    document: {
      querySelectorAll: (sel) => (sel === "[data-copy]" ? [btn] : []),
    },
    navigator: { clipboard },
    window: {
      ImageForgeUi: {
        flashLabel(target, text) {
          flashes.push({ target, text });
        },
      },
    },
    console,
  };
  vm.runInNewContext(fs.readFileSync(FILE, "utf8"), sandbox);
  return flashes;
}

test("clicking the button copies the url from data-copy and flashes Copied", async () => {
  const btn = stubButton("https://example.test/c/ABC123");
  let written = null;
  const flashes = load(btn, {
    writeText: async (text) => {
      written = text;
    },
  });

  await btn.onClick();

  assert.equal(written, "https://example.test/c/ABC123");
  assert.deepEqual(flashes, [{ target: btn, text: "Copied" }]);
});

test("a rejected clipboard write tells the visitor, not just the console", async () => {
  const btn = stubButton("https://example.test/c/ABC123");
  const flashes = load(btn, {
    writeText: async () => {
      throw new Error("denied");
    },
  });

  await btn.onClick();

  assert.deepEqual(flashes, [{ target: btn, text: "Copy failed" }]);
});

test("no clipboard API at all is treated the same as a failed write", async () => {
  const btn = stubButton("https://example.test/c/ABC123");
  const flashes = load(btn, undefined);

  await btn.onClick();

  assert.deepEqual(flashes, [{ target: btn, text: "Copy failed" }]);
});
