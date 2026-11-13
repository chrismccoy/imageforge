/**
 * Favourites view: the last card off a later page
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const FILE = path.join(__dirname, "..", "..", "public", "js", "favorite.js");

function load(location) {
  const grid = { hidden: false, children: [] };
  const empty = { hidden: true };
  const card = {
    remove() {
      grid.children = grid.children.filter((item) => item !== card);
    },
  };
  grid.children.push(card);

  const button = {
    disabled: false,
    attrs: { "data-gen-id": "3" },
    listeners: {},
    classList: { toggle() {} },
    getAttribute(name) {
      return this.attrs[name] || null;
    },
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    addEventListener(name, fn) {
      this.listeners[name] = fn;
    },
    closest: (sel) => (sel === "[data-generation-card]" ? card : null),
  };

  let reloads = 0;
  location.reload = () => {
    reloads += 1;
  };

  const sandbox = {
    document: {
      querySelector: (sel) =>
        ({
          "[data-favourites-view]": {},
          "[data-list-grid]": grid,
          "[data-empty-state]": empty,
        })[sel] || null,
      querySelectorAll: (sel) =>
        sel === "[data-favorite]" ? [button] : sel === "[data-list-head]" ? [] : [],
      getElementById: () => null,
    },
    window: {
      location,
      ImageForgeApi: { post: async () => ({ favorite: 0 }), notice() {} },
      ImageForgeUi: {
        show(el, on) {
          if (el) el.hidden = !on;
        },
      },
    },
    console,
  };
  vm.runInNewContext(fs.readFileSync(FILE, "utf8"), sandbox);
  return { button, empty, reloads: () => reloads };
}

test("unstarring the last card on page 2 reloads rather than saying none are left", async () => {
  const page = load({ pathname: "/generations/page/2", search: "?fav=1" });

  await page.button.listeners.click();

  assert.equal(page.reloads(), 1);
  assert.equal(page.empty.hidden, true, "'No favourites yet.' is not shown");
});

test("unstarring the last card on page 1 shows the empty state", async () => {
  const page = load({ pathname: "/generations", search: "?fav=1" });

  await page.button.listeners.click();

  assert.equal(page.reloads(), 0);
  assert.equal(page.empty.hidden, false);
});
