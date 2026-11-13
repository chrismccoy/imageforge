/**
 * Prompt rows: sort keys after a rating or a pin, and the client order
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const JS = path.join(__dirname, "..", "..", "public", "js");
const read = (name) => fs.readFileSync(path.join(JS, name), "utf8");

function classes() {
  const set = new Set();
  return {
    toggle: (name, on) => (on ? set.add(name) : set.delete(name)),
    contains: (name) => set.has(name),
  };
}

function element(attrs = {}) {
  return {
    attrs: Object.assign({}, attrs),
    classList: classes(),
    listeners: {},
    getAttribute(name) {
      return name in this.attrs ? this.attrs[name] : null;
    },
    setAttribute(name, value) {
      this.attrs[name] = String(value);
    },
    addEventListener(name, fn) {
      this.listeners[name] = fn;
    },
    focus() {},
  };
}

/** A table of prompt rows, each with a pin and five stars. */
function table(sort, rows) {
  const body = element({ "data-prompt-rows": "", "data-sort": sort });
  body.children = [];
  body.appendChild = (row) => {
    body.children = body.children.filter((other) => other !== row);
    body.children.push(row);
  };
  body.querySelectorAll = (sel) =>
    sel === "[data-prompt-row]" ? body.children.slice() : [];

  rows.forEach(({ id, key, pinned, rating }) => {
    const row = element({ "data-prompt-row": "", "data-sort-key": key });
    const pin = element({
      "data-pin": "",
      "data-prompt-id": String(id),
      "aria-pressed": pinned ? "true" : "false",
    });
    const group = element({
      "data-rating-group": "",
      "data-prompt-id": String(id),
      "data-rating": rating ? String(rating) : "",
    });
    const stars = [1, 2, 3, 4, 5].map((n) => element({ "data-star": String(n) }));

    row.id = id;
    row.pin = pin;
    row.group = group;
    row.stars = stars;
    row.querySelector = (sel) => (sel === "[data-pin]" ? pin : null);
    row.closest = (sel) => (sel === "[data-prompt-rows]" ? body : null);
    pin.closest = (sel) =>
      sel === "[data-pin]" ? pin : sel === "[data-prompt-row]" ? row : null;
    group.closest = (sel) => (sel === "[data-prompt-row]" ? row : null);
    group.querySelectorAll = (sel) => (sel === "[data-star]" ? stars : []);
    body.children.push(row);
  });
  return body;
}

function load(body, answer) {
  const asked = [];
  let docClick = null;
  const sandbox = {
    document: {
      querySelector: (sel) => (sel === "[data-prompt-rows]" ? body : null),
      querySelectorAll: (sel) =>
        sel === "[data-rating-group]" ? body.children.map((row) => row.group) : [],
      addEventListener(name, fn) {
        if (name === "click") docClick = fn;
      },
    },
    window: {
      ImageForgeApi: {
        post(url, payload) {
          asked.push({ url, payload });
          return answer(url, payload);
        },
        notice() {},
      },
    },
    console,
  };
  vm.runInNewContext(read("pin-order.js"), sandbox);
  vm.runInNewContext(read("pin.js"), sandbox);
  vm.runInNewContext(read("rating.js"), sandbox);
  return {
    asked,
    order: sandbox.window.ImageForgePinOrder,
    pin: (row) => docClick({ target: row.pin }),
    star: (row, n) => row.stars[n - 1].listeners.click(),
  };
}

const names = (body) => body.children.map((row) => row.id).join(",");

test("a rating writes the row's new sort key, so a later pin re-orders right", async () => {
  const body = table("rating", [
    { id: 1, key: "0|02|middle", rating: 3 },
    { id: 2, key: "1|00|zulu" },
    { id: 3, key: "1|00|zz" },
  ]);
  const page = load(body, async (url) => {
    if (url === "/prompts/2/rating/5") return { rating: 5, sortKey: "0|00|zulu" };
    if (url === "/prompts/3/pin") return { pinned: 1, sortKey: "1|00|zz" };
    throw new Error("unexpected " + url);
  });

  const zulu = body.children[1];
  await page.star(zulu, 5);
  assert.equal(page.asked[0].payload.sort, "rating", "the page's sort is sent");
  assert.equal(zulu.getAttribute("data-sort-key"), "0|00|zulu");

  await page.pin(body.children[2]);
  assert.equal(names(body), "3,2,1", "pin first, then five stars before three");
});

test("a pin writes the sort key the server sent back", async () => {
  const body = table("rating", [
    { id: 1, key: "0|00|alpha" },
    { id: 2, key: "stale" },
  ]);
  const page = load(body, async () => ({ pinned: 0, sortKey: "0|01|bravo" }));

  await page.pin(body.children[1]);

  assert.equal(page.asked[0].payload.sort, "rating");
  const bravo = body.children.find((row) => row.id === 2);
  assert.equal(bravo.getAttribute("data-sort-key"), "0|01|bravo");
  assert.equal(names(body), "1,2");
});

test("a double click on a star sends one request, not two", async () => {
  const body = table("name", [{ id: 4, key: "a" }]);
  let release;
  const page = load(
    body,
    () =>
      new Promise((done) => {
        release = done;
      })
  );

  const row = body.children[0];
  const first = page.star(row, 3);
  page.star(row, 3);
  assert.equal(page.asked.length, 1);

  release({ rating: 3, sortKey: "a" });
  await first;
  assert.equal(row.group.getAttribute("data-rating"), "3");

  const again = page.star(row, 4);
  assert.equal(page.asked.length, 2, "once it lands, the stars work again");
  release({ rating: 4, sortKey: "a" });
  await again;
});

test("keys are compared by code point, as SQLite compares UTF-8", () => {
  const page = load(table("name", []), async () => ({}));
  const rows = [
    { pinned: false, key: "\u{1F600}" },
    { pinned: false, key: "～" },
  ];

  const sorted = page.order.sortRows(rows).map((row) => row.key);
  assert.deepEqual(sorted, ["～", "\u{1F600}"]);
});

test("rows with the same key fall back to the id", () => {
  const page = load(table("name", []), async () => ({}));
  const rows = [
    { pinned: false, key: "same", id: 9 },
    { pinned: false, key: "same", id: 2 },
    { pinned: false, key: "same", id: 5 },
  ];

  const ids = page.order.sortRows(rows).map((row) => row.id);
  assert.deepEqual(ids, [2, 5, 9]);
});
