/**
 * partials/empty-state.ejs
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const ejs = require("ejs");

const VIEWS = path.join(__dirname, "..", "..", "views");
const PARTIAL = path.join(VIEWS, "partials", "empty-state.ejs");
const PUBLIC_PARTIAL = path.join(VIEWS, "partials", "public", "empty.ejs");

function render(locals) {
  return ejs.renderFile(PARTIAL, locals);
}

function renderPublic(locals) {
  return ejs.renderFile(PUBLIC_PARTIAL, locals);
}

test("an absent note renders no second line, empty or otherwise", async () => {
  const html = await render({ icon: "fa-solid fa-star", text: "Nothing here." });
  assert.doesNotMatch(html, /<p class="mt-1/, "no note paragraph at all");
  assert.equal((html.match(/<p/g) || []).length, 1);
});

test("an absent link renders no anchor", async () => {
  const html = await render({ icon: "fa-solid fa-star", text: "Nothing here." });
  assert.doesNotMatch(html, /<a\s/);
});

test("a note and a link, when given, render with their text and href", async () => {
  const html = await render({
    icon: "fa-solid fa-star",
    text: "Nothing here.",
    note: "A second line.",
    link: { href: "/somewhere", label: "Go" },
  });
  assert.match(html, /<p class="mt-1 text-sm">A second line\.<\/p>/);
  assert.match(html, /<a href="\/somewhere" class="[^"]*">Go<\/a>/);
});

test("the public panel drops the utility classes, for the component CSS to style instead", async () => {
  const html = await renderPublic({
    icon: "fa-regular fa-images",
    text: "Nothing shared yet.",
  });
  assert.match(html, /<div class="empty">/, "no text-slate-400 on the wrapper");
  assert.match(
    html,
    /<i class="fa-regular fa-images" aria-hidden="true">/,
    "no icon extra"
  );
  assert.match(html, /<p>Nothing shared yet\.<\/p>/, "no class on the paragraph");
});

test("live adds data-empty-state, and hide adds the hidden attribute alongside it", async () => {
  const html = await render({
    icon: "fa-solid fa-star",
    text: "Nothing here.",
    live: true,
    hide: true,
  });
  assert.match(html, /<div class="empty text-slate-400" data-empty-state hidden>/);
});

test("neither live nor hide appears unless asked for", async () => {
  const html = await render({ icon: "fa-solid fa-star", text: "Nothing here." });
  assert.doesNotMatch(html, /data-empty-state/);
  assert.doesNotMatch(html, /\shidden(?=[\s>])/);
});
