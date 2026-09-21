/**
 * No server-rendered inline style attributes in views/
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const VIEWS_DIR = path.join(__dirname, "..", "..", "views");

const INLINE_STYLE = /\sstyle\s*=\s*["']/;

test("no view ships a server-rendered style attribute", () => {
  const offenders = [];

  for (const name of fs.readdirSync(VIEWS_DIR, { recursive: true })) {
    if (!name.endsWith(".ejs")) continue;
    const full = path.join(VIEWS_DIR, name);
    const lines = fs.readFileSync(full, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (INLINE_STYLE.test(line)) {
        offenders.push(`${name}:${index + 1}: ${line.trim()}`);
      }
    });
  }

  assert.deepEqual(
    offenders,
    [],
    `server-rendered style="..." attribute(s) found — the CSP (style-src ` +
      `'self', no 'unsafe-inline') silently drops these in a browser. Carry ` +
      `the value in a data- attribute and apply it through the CSSOM from a ` +
      `public/js/*.js file instead, as public/js/bar.js does:\n` +
      offenders.join("\n")
  );
});
