/**
 * Template tests
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BROWSER_FILE = path.join(
  __dirname,
  "..",
  "..",
  "public",
  "js",
  "template.js"
);

function templateTools() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(BROWSER_FILE, "utf8"), sandbox);
  return sandbox.window.ImageForgeTemplate;
}

const tools = templateTools();

const variablesIn = (text) => Array.from(tools.variablesIn(text));
const fillTemplate = (text, values) => tools.fillTemplate(text, values);

test("a prompt with no braces has no variables", () => {
  assert.deepEqual(variablesIn("a plain prompt"), []);
  assert.deepEqual(variablesIn(""), []);
  assert.deepEqual(variablesIn(null), []);
});

test("variables come back in the order they first appear", () => {
  assert.deepEqual(variablesIn("{color} sunset over {place}"), ["color", "place"]);
});

test("a repeated variable is listed once", () => {
  assert.deepEqual(variablesIn("{color} on {color}"), ["color"]);
});

test("names may hold spaces, digits, hyphens and underscores", () => {
  assert.deepEqual(variablesIn("{main subject} {shot_type} {lens-mm} {take2}"), [
    "main subject",
    "shot_type",
    "lens-mm",
    "take2",
  ]);
});

test("empty or unclosed braces are not variables", () => {
  assert.deepEqual(variablesIn("{} { } {unclosed and text"), []);
});

test("at most twenty variables get picked up", () => {
  const many = Array.from({ length: 30 }, (_, i) => `{v${i}}`).join(" ");
  assert.equal(variablesIn(many).length, 20);
});

test("filling replaces every occurrence of a variable", () => {
  assert.equal(fillTemplate("{color} on {color}", { color: "red" }), "red on red");
});

test("an unfilled variable stays visible rather than vanishing", () => {
  assert.equal(
    fillTemplate("{color} sunset over {place}", { color: "golden" }),
    "golden sunset over {place}"
  );
  assert.equal(fillTemplate("{color} sunset", { color: "   " }), "{color} sunset");
  assert.equal(fillTemplate("{color} sunset", {}), "{color} sunset");
  assert.equal(fillTemplate("{color} sunset", null), "{color} sunset");
});

test("a value containing braces is not substituted again", () => {
  assert.equal(fillTemplate("{a} and {b}", { a: "{b}", b: "two" }), "{b} and two");
});

test("square brackets mark a variable too", () => {
  assert.deepEqual(variablesIn("[color] sunset over [place]"), ["color", "place"]);
  assert.deepEqual(variablesIn("{color} sunset over [place]"), ["color", "place"]);
  assert.deepEqual(
    variablesIn("A modern isometric illustration of a [subject or concept]"),
    ["subject or concept"]
  );
});

test("a name is one variable however it is written", () => {
  assert.deepEqual(variablesIn("{color} on [color]"), ["color"]);
  assert.equal(fillTemplate("{color} on [color]", { color: "red" }), "red on red");
});

test("an unfilled bracket variable keeps its own brackets", () => {
  assert.equal(
    fillTemplate("[color] sunset over [place]", { color: "golden" }),
    "golden sunset over [place]",
    "the placeholder comes back as it was written, not converted"
  );
  assert.equal(fillTemplate("{a} and [b]", {}), "{a} and [b]");
});

test("mismatched brackets are not a variable", () => {
  assert.deepEqual(variablesIn("{color] and [place}"), []);
  assert.deepEqual(variablesIn("[] [ ]"), []);
});
