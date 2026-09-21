/**
 * Declaring what a controller needs
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { requireDeps } = require("../../controllers/support/helpers/requireDeps");

test("a complete container is handed straight back", () => {
  const deps = { models: {}, access: {} };
  assert.equal(requireDeps(deps, ["models", "access"], "someController"), deps);
});

test("a missing key is refused by name, and so is the caller", () => {
  assert.throws(
    () => requireDeps({ models: {} }, ["models", "pending"], "editController"),
    /editController needs deps\.pending/
  );
});

test("several missing keys are all named", () => {
  assert.throws(
    () => requireDeps({}, ["models", "access"], "galleryController"),
    /galleryController needs deps\.models, deps\.access/
  );
});

test("no container at all is refused rather than destructured", () => {
  assert.throws(
    () => requireDeps(undefined, ["models"], "promptsController"),
    /promptsController needs deps\.models/
  );
});

test("a key that is present but falsy is still missing", () => {
  assert.throws(
    () => requireDeps({ models: null }, ["models"], "filesController"),
    /filesController needs deps\.models/
  );
});

const CONTROLLERS = path.join(__dirname, "..", "..", "controllers");

test("every controller that needs something says so", () => {
  const silent = [];

  for (const name of fs.readdirSync(CONTROLLERS)) {
    if (!name.endsWith(".js")) continue;
    const source = fs.readFileSync(path.join(CONTROLLERS, name), "utf8");

    const factory = /module\.exports = \((deps|\{[^}]*\})\)/.exec(source);
    if (!factory) continue;

    const takes = /const \{[\s\S]*?\} = requireDeps\(/.test(source);
    const destructuresInPlace = factory[1].startsWith("{");
    const everythingDefaulted =
      destructuresInPlace &&
      factory[1]
        .slice(1, -1)
        .split(",")
        .every((part) => part.includes("="));

    if (!takes && !everythingDefaulted) silent.push(name);
  }

  assert.deepEqual(
    silent,
    [],
    "these controllers take dependencies without declaring them to requireDeps"
  );
});
