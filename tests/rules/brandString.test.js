/**
 * The brand is not written into the views
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { DEFAULT_BRAND_NAME } = require("../../config/brand");

const VIEWS = path.join(__dirname, "..", "..", "views");

function views(dir = VIEWS) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return views(full);
    return entry.name.endsWith(".ejs") ? [full] : [];
  });
}

test("no view writes the brand name by hand", () => {
  const offenders = views()
    .filter((file) => fs.readFileSync(file, "utf8").includes(DEFAULT_BRAND_NAME))
    .map((file) => path.relative(VIEWS, file));

  assert.deepEqual(
    offenders,
    [],
    `these views name the brand instead of reading it: ${offenders.join(", ")}`
  );
});

test("no view draws the brand mark by hand", () => {
  const offenders = views()
    .filter((file) => fs.readFileSync(file, "utf8").includes("fa-bolt"))
    .map((file) => path.relative(VIEWS, file));

  assert.deepEqual(
    offenders,
    [],
    `these views draw the bolt instead of reading brand.icon: ${offenders.join(", ")}`
  );
});
