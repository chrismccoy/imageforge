/**
 * Drop zone tests
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const FILE = path.join(__dirname, "..", "..", "public", "js", "upload-sort.js");

function names(files) {
  return Array.prototype.map.call(files, (file) => file.name).join(",");
}

function load() {
  const sandbox = {
    document: {
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
      addEventListener() {},
    },
    window: { ImageForgeUi: { show() {}, readableBytes: (n) => `${n} bytes` } },
    console,
  };
  sandbox.window.document = sandbox.document;
  vm.runInNewContext(fs.readFileSync(FILE, "utf8"), sandbox);
  return sandbox.window.ImageForgeUploadSort;
}

const RULES = {
  allowed: ["image/png", "image/jpeg"],
  maxBytes: 1000,
  maxFiles: 3,
  readableBytes: (n) => `${n} bytes`,
};

const png = (name, size = 10) => ({ name, type: "image/png", size });

test("files the app takes are all kept", () => {
  const { sortFiles } = load();
  const out = sortFiles([png("a.png"), png("b.png")], RULES);

  assert.equal(names(out.accepted), "a.png,b.png");
  assert.equal(out.refused.length, 0);
});

test("a file of the wrong kind is refused by name, and the rest go on", () => {
  const { sortFiles } = load();
  const out = sortFiles(
    [png("good.png"), { name: "notes.txt", type: "text/plain", size: 10 }],
    RULES
  );

  assert.equal(names(out.accepted), "good.png");
  assert.equal(out.refused.length, 1);
  assert.equal(out.refused[0].name, "notes.txt");
  assert.match(out.refused[0].reason, /PNG, JPEG/);
});

test("a file over the size limit is refused on its own", () => {
  const { sortFiles } = load();
  const out = sortFiles([png("huge.png", 5000), png("small.png")], RULES);

  assert.equal(names(out.accepted), "small.png");
  assert.match(out.refused[0].reason, /larger than/i);
});

test("more files than the server takes are refused, not silently dropped", () => {
  const { sortFiles } = load();
  const out = sortFiles(
    [png("1.png"), png("2.png"), png("3.png"), png("4.png"), png("5.png")],
    RULES
  );

  assert.equal(out.accepted.length, 3, "the first three fit");
  assert.equal(out.refused.length, 2, "and the rest are said out loud");
  assert.match(out.refused[0].reason, /3 at a time/);
});

test("the count is of files that will actually be sent", () => {
  const { sortFiles } = load();
  const out = sortFiles(
    [
      { name: "a.txt", type: "text/plain", size: 10 },
      { name: "b.txt", type: "text/plain", size: 10 },
      png("1.png"),
      png("2.png"),
      png("3.png"),
    ],
    RULES
  );

  assert.equal(out.accepted.length, 3);
  assert.equal(out.refused.length, 2);
});

test("nothing dropped is nothing accepted, rather than an error", () => {
  const { sortFiles } = load();
  const out = sortFiles([], RULES);
  assert.equal(out.accepted.length, 0);
  assert.equal(out.refused.length, 0);
});
