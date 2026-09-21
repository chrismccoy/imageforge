/**
 * Mask editor tests
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const FILE = path.join(__dirname, "..", "..", "public", "js", "edit-geometry.js");

function load() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(FILE, "utf8"), sandbox);
  return sandbox.window.ImageForgeEditGeometry;
}

function plain(point) {
  return { x: point.x, y: point.y };
}

test("a point on a displayed image maps to the natural pixel", () => {
  const { toCanvasPoint } = load();

  const rect = { left: 0, top: 0, width: 512, height: 512 };
  assert.deepEqual(
    plain(toCanvasPoint({ clientX: 100, clientY: 50 }, rect, 1024, 1024)),
    { x: 200, y: 100 }
  );
});

test("the box's own offset is taken off first", () => {
  const { toCanvasPoint } = load();
  const rect = { left: 40, top: 20, width: 512, height: 512 };
  assert.deepEqual(
    plain(toCanvasPoint({ clientX: 140, clientY: 70 }, rect, 1024, 1024)),
    { x: 200, y: 100 }
  );
});

test("a tall image scales each axis by its own ratio", () => {
  const { toCanvasPoint } = load();
  const rect = { left: 0, top: 0, width: 512, height: 768 };
  assert.deepEqual(
    plain(toCanvasPoint({ clientX: 256, clientY: 384 }, rect, 1024, 1536)),
    { x: 512, y: 768 }
  );
});

test("a rect with no size does not divide by zero", () => {
  const { toCanvasPoint } = load();
  const rect = { left: 0, top: 0, width: 0, height: 0 };
  const point = toCanvasPoint({ clientX: 10, clientY: 10 }, rect, 1024, 1024);
  assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
});

test("the brush is scaled the same way as the pointer", () => {
  const { toCanvasBrush } = load();
  assert.equal(toCanvasBrush(48, { width: 512 }, 1024), 96);
  assert.equal(toCanvasBrush(48, { width: 0 }, 1024), 48, "no view, no scaling");
});
