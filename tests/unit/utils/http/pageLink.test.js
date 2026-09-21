/**
 * Page link tests
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");

const { pageLink, LINK_KEYS } = require("../../../../utils/http/pageLink");

test("page one has no page segment", () => {
  assert.equal(pageLink("/generations", 1, {}), "/generations");
  assert.equal(pageLink("/prompts", 1, {}), "/prompts");
});

test("later pages carry the page segment", () => {
  assert.equal(pageLink("/generations", 2, {}), "/generations/page/2");
  assert.equal(pageLink("/generations", 17, {}), "/generations/page/17");
});

test("a filter rides in the query string on every page", () => {
  assert.equal(pageLink("/generations", 1, { q: "tokyo" }), "/generations?q=tokyo");
  assert.equal(
    pageLink("/generations", 2, { q: "tokyo" }),
    "/generations/page/2?q=tokyo"
  );
});

test("an empty or missing filter adds nothing", () => {
  assert.equal(pageLink("/generations", 2, { q: "" }), "/generations/page/2");
  assert.equal(pageLink("/generations", 2, { q: null }), "/generations/page/2");
  assert.equal(pageLink("/generations", 2, undefined), "/generations/page/2");
});

test("a key outside the whitelist never reaches the link", () => {
  const link = pageLink("/generations", 2, { q: "tokyo", evil: "<script>" });
  assert.equal(link, "/generations/page/2?q=tokyo");
  assert.equal(link.includes("evil"), false);
});

test("values are encoded", () => {
  assert.equal(
    pageLink("/generations", 1, { q: "a&b=c" }),
    "/generations?q=a%26b%3Dc"
  );
});

test("a page number that is not a positive integer falls back to one", () => {
  assert.equal(pageLink("/generations", 0, {}), "/generations");
  assert.equal(pageLink("/generations", -3, {}), "/generations");
  assert.equal(pageLink("/generations", NaN, {}), "/generations");
  assert.equal(pageLink("/generations", "2", {}), "/generations/page/2");
});

test("the whitelist is what later filters extend", () => {
  assert.deepEqual(LINK_KEYS, [
    "q",
    "fav",
    "sort",
    "category",
    "collection",
    "prompt",
    "view",
  ]);
});

test("the favorite flag rides alongside the search term", () => {
  assert.equal(
    pageLink("/generations", 2, { q: "tokyo", fav: "1" }),
    "/generations/page/2?q=tokyo&fav=1"
  );
  assert.equal(pageLink("/generations", 1, { fav: "1" }), "/generations?fav=1");
  assert.equal(pageLink("/generations", 1, { fav: "" }), "/generations");
});
