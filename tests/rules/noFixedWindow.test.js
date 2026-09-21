/**
 * No fixed-width structural window
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const TESTS_DIR = path.join(__dirname, "..");

const BOUNDED_WINDOW = /\{[01],\d+\}/;

test("no test matches markup with a fixed-width character window", () => {
  const offenders = [];

  for (const name of fs.readdirSync(TESTS_DIR, { recursive: true })) {
    if (!name.endsWith(".test.js")) continue;
    const full = path.join(TESTS_DIR, name);
    const lines = fs.readFileSync(full, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (BOUNDED_WINDOW.test(line)) {
        offenders.push(`${name}:${index + 1}: ${line.trim()}`);
      }
    });
  }

  assert.deepEqual(
    offenders,
    [],
    `fixed-width structural window(s) found — anchor on the element instead, ` +
      `via tests/helpers/dom.js:\n${offenders.join("\n")}`
  );
});
