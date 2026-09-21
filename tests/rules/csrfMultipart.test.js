/**
 * Multipart CSRF guard
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROUTES_DIR = path.join(__dirname, "..", "..", "routes");

test("every router that parses multipart goes through middleware/multipart", () => {
  const unguarded = fs
    .readdirSync(ROUTES_DIR)
    .filter((name) => name.endsWith(".js"))
    .map((name) => ({
      name,
      source: fs.readFileSync(path.join(ROUTES_DIR, name), "utf8"),
    }))
    .filter(({ source }) => source.includes("multer("))
    .filter(({ source }) => !source.includes("middleware/multipart"))
    .map(({ name }) => name);

  assert.deepEqual(
    unguarded,
    [],
    `these routers parse multipart without the CSRF check that comes with it: ${unguarded}`
  );
});

test("the multipart helpers hand back the parser and the check, in that order", () => {
  const { parseAndRecord, parseOrRefuse } = require("../../middleware/multipart");
  const { requireCsrf } = require("../../middleware/csrf");
  const noop = (req, res, next) => next();

  for (const build of [parseAndRecord, parseOrRefuse]) {
    const mounted = build(noop, { tooLarge: "big", unreadable: "no" });
    assert.equal(mounted.length, 2, "a parser and a check");
    assert.equal(mounted[1], requireCsrf, "the check comes second");
  }
});

test("the routers known to parse multipart are still the ones being checked", () => {
  const multipart = fs
    .readdirSync(ROUTES_DIR)
    .filter((name) => name.endsWith(".js"))
    .filter((name) =>
      fs.readFileSync(path.join(ROUTES_DIR, name), "utf8").includes("multer(")
    )
    .sort();

  assert.deepEqual(multipart, ["api.js", "prompts.js", "uploads.js"]);
});
