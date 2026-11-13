/**
 * Crop: handles stop at the edge, ratios follow the handle, left button only
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const JS = path.join(__dirname, "..", "..", "public", "js");
const read = (name) => fs.readFileSync(path.join(JS, name), "utf8");

function geometry() {
  const sandbox = { window: {} };
  vm.runInNewContext(read("crop-geometry.js"), sandbox);
  return sandbox.window.ImageForgeCropGeometry;
}

function plain(box) {
  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.round(box.width),
    height: Math.round(box.height),
  };
}

const BOUNDS = { width: 400, height: 300 };

/** What crop.js does with a drag: clamp, then shape. */
function dragged(start, handle, dx, dy, ratio) {
  const { dragBox, clampBox, applyRatio } = geometry();
  const next = dragBox(start, handle, dx, dy);
  return plain(applyRatio(clampBox(next, BOUNDS, handle), ratio, BOUNDS, handle));
}

test("the west handle dragged past the edge stops there; the right edge stays", () => {
  const out = dragged({ x: 10, y: 10, width: 100, height: 50 }, "w", -50, 0);
  assert.deepEqual(out, { x: 0, y: 10, width: 110, height: 50 });
});

test("the east handle dragged past the edge stops there; the left edge stays", () => {
  const out = dragged({ x: 300, y: 10, width: 80, height: 50 }, "e", 90, 0);
  assert.deepEqual(out, { x: 300, y: 10, width: 100, height: 50 });
});

test("the north handle dragged past the top keeps the bottom edge", () => {
  const out = dragged({ x: 10, y: 20, width: 100, height: 50 }, "n", 0, -60);
  assert.deepEqual(out, { x: 10, y: 0, width: 100, height: 70 });
});

test("a move past the edge still slides the box back whole", () => {
  const out = dragged({ x: 10, y: 10, width: 100, height: 50 }, null, -50, 0);
  assert.deepEqual(out, { x: 0, y: 10, width: 100, height: 50 });
});

test("with a ratio the north handle sets the height and keeps the bottom", () => {
  const out = dragged({ x: 100, y: 100, width: 100, height: 100 }, "n", 0, -40, 1);
  assert.deepEqual(out, { x: 100, y: 60, width: 140, height: 140 });
});

test("with a ratio the south handle sets the height", () => {
  const out = dragged({ x: 100, y: 100, width: 100, height: 100 }, "s", 0, 30, 1);
  assert.deepEqual(out, { x: 100, y: 100, width: 130, height: 130 });
});

test("with a ratio the north-west corner keeps the bottom-right corner", () => {
  const out = dragged({ x: 100, y: 100, width: 100, height: 100 }, "nw", -20, 0, 1);
  assert.deepEqual(out, { x: 80, y: 80, width: 120, height: 120 });
});

test("with a ratio the north-east corner keeps the bottom edge", () => {
  const out = dragged({ x: 100, y: 100, width: 100, height: 100 }, "ne", 20, 0, 1);
  assert.deepEqual(out, { x: 100, y: 80, width: 120, height: 120 });
});

function cropPage() {
  const listeners = {};
  const box = { attrs: {}, style: {}, getAttribute: () => null };
  const stage = {
    addEventListener(name, fn) {
      listeners[name] = fn;
    },
    setPointerCapture() {},
  };
  const parts = {
    source: {
      clientWidth: 400,
      clientHeight: 300,
      naturalWidth: 400,
      naturalHeight: 300,
      complete: true,
      addEventListener() {},
    },
    stage,
    "crop-box": box,
    "crop-size": {},
    "crop-btn": { addEventListener() {} },
  };
  ["shade-top", "shade-bottom", "shade-left", "shade-right"].forEach((id) => {
    parts[id] = { style: {} };
  });

  const sandbox = {
    document: {
      getElementById: (id) => parts[id] || null,
      querySelector: () => null,
    },
    window: { addEventListener() {} },
    console,
  };
  sandbox.window.ImageForgeApi = { GENERIC_ERR: "x" };
  sandbox.window.ImageForgeUi = { setStatus() {}, show() {} };
  vm.runInNewContext(read("crop-geometry.js"), sandbox);
  vm.runInNewContext(read("crop.js"), sandbox);
  return { listeners, box };
}

function pointer(button, x) {
  const handle = { getAttribute: () => "e" };
  return {
    button,
    clientX: x,
    clientY: 0,
    pointerId: 1,
    preventDefault() {},
    target: { closest: (sel) => (sel === "[data-handle]" ? handle : null) },
  };
}

test("a right or middle drag on a handle does not resize the crop box", () => {
  for (const button of [1, 2]) {
    const page = cropPage();
    page.listeners.pointerdown(pointer(button, 400));
    page.listeners.pointermove(pointer(button, 300));
    assert.equal(page.box.style.width, "400px", `button ${button}`);
  }
});

test("a left drag on a handle still resizes the crop box", () => {
  const page = cropPage();
  page.listeners.pointerdown(pointer(0, 400));
  page.listeners.pointermove(pointer(0, 300));
  assert.equal(page.box.style.width, "300px");
});
