/**
 * Readable byte sizes, both copies
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { readableBytes } = require("../../utils/domain/format");

const BROWSER_FILE = path.join(__dirname, "..", "..", "public", "js", "ui.js");

function browserReadableBytes() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(BROWSER_FILE, "utf8"), sandbox);

  const ui = sandbox.window.ImageForgeUi;
  assert.ok(ui, "public/js/ui.js should define window.ImageForgeUi");
  assert.equal(
    typeof ui.readableBytes,
    "function",
    "window.ImageForgeUi should expose readableBytes"
  );
  return ui.readableBytes;
}

test("the browser copy of readableBytes matches the server's", () => {
  const readableSize = browserReadableBytes();

  const sizes = [
    0,
    1,
    1023,
    1024,
    2048,
    1024 * 1024 - 1,
    1024 * 1024,
    10 * 1024 * 1024, // the upload limit, which both of them state
    1024 * 1024 + 512 * 1024,
    500 * 1024 * 1024, // the storage quota
  ];

  for (const bytes of sizes) {
    assert.equal(
      readableSize(bytes),
      readableBytes(bytes),
      `the two disagree at ${bytes} bytes`
    );
  }
});
