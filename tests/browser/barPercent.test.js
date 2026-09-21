/**
 * public/js/bar.js
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const FILE = path.join(__dirname, "..", "..", "public", "js", "bar.js");

function bar(attrs) {
  return {
    attrs: attrs,
    style: {},
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name)
        ? this.attrs[name]
        : null;
    },
  };
}

function run(bars) {
  const sandbox = {
    document: {
      querySelectorAll(selector) {
        assert.equal(selector, "[data-bar-percent]");
        return bars;
      },
    },
  };
  vm.runInNewContext(fs.readFileSync(FILE, "utf8"), sandbox);
  return bars;
}

test("a bar at 33 gets 33% width", () => {
  const b = bar({ "data-bar-percent": "33" });
  run([b]);
  assert.equal(b.style.width, "33%");
});

test("a bar at 0 stays empty", () => {
  const b = bar({ "data-bar-percent": "0" });
  run([b]);
  assert.equal(b.style.width, "0%");
});

test("a percent over 100 is held to 100", () => {
  const b = bar({ "data-bar-percent": "140" });
  run([b]);
  assert.equal(b.style.width, "100%");
});

test("a percent that makes no sense is treated as empty, not full", () => {
  const b = bar({ "data-bar-percent": "not-a-number" });
  run([b]);
  assert.equal(b.style.width, "0%");
});

test("every matching bar on the page is set independently", () => {
  const low = bar({ "data-bar-percent": "10" });
  const high = bar({ "data-bar-percent": "92" });
  run([low, high]);
  assert.equal(low.style.width, "10%");
  assert.equal(high.style.width, "92%");
});
