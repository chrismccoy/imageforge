/**
 * Crop box geometry
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const FILE = path.join(__dirname, "..", "..", "public", "js", "crop-geometry.js");

function load() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(FILE, "utf8"), sandbox);
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

test("a box inside the picture is left where it is", () => {
  const { clampBox } = load();
  const box = { x: 10, y: 20, width: 100, height: 50 };
  assert.deepEqual(plain(clampBox(box, BOUNDS)), box);
});

test("a box dragged off the left or top is pushed back on", () => {
  const { clampBox } = load();
  assert.deepEqual(
    plain(clampBox({ x: -30, y: -10, width: 100, height: 50 }, BOUNDS)),
    {
      x: 0,
      y: 0,
      width: 100,
      height: 50,
    }
  );
});

test("a box dragged off the right is pushed back, keeping its size", () => {
  const { clampBox } = load();
  assert.deepEqual(
    plain(clampBox({ x: 380, y: 0, width: 100, height: 50 }, BOUNDS)),
    {
      x: 300,
      y: 0,
      width: 100,
      height: 50,
    }
  );
});

test("a box bigger than the picture is cut down to it", () => {
  const { clampBox } = load();
  assert.deepEqual(
    plain(clampBox({ x: 0, y: 0, width: 900, height: 900 }, BOUNDS)),
    {
      x: 0,
      y: 0,
      width: 400,
      height: 300,
    }
  );
});

test("a box cannot be dragged away to nothing", () => {
  const { clampBox, MIN_SIDE } = load();
  const tiny = clampBox({ x: 10, y: 10, width: 1, height: 0 }, BOUNDS);

  assert.ok(tiny.width >= MIN_SIDE, `width ${tiny.width} is at least ${MIN_SIDE}`);
  assert.ok(tiny.height >= MIN_SIDE);
});

test("a square ratio makes the sides match", () => {
  const { applyRatio } = load();
  const square = applyRatio({ x: 0, y: 0, width: 200, height: 50 }, 1, BOUNDS);

  assert.equal(Math.round(square.width), Math.round(square.height));
});

test("a ratio is taken from the width, so dragging wider makes it taller", () => {
  const { applyRatio } = load();
  const wide = applyRatio({ x: 0, y: 0, width: 300, height: 40 }, 1.5, BOUNDS);
  assert.deepEqual(plain(wide), { x: 0, y: 0, width: 300, height: 200 });
});

test("a ratio that would run off the bottom is fitted from the height instead", () => {
  const { applyRatio } = load();
  const tall = applyRatio({ x: 0, y: 0, width: 400, height: 300 }, 2 / 3, BOUNDS);

  assert.ok(tall.height <= BOUNDS.height, `height ${tall.height} fits`);
  assert.equal(Number((tall.width / tall.height).toFixed(3)), 0.667, "still 2:3");
});

test("no ratio leaves the box exactly as it was", () => {
  const { applyRatio } = load();
  const box = { x: 5, y: 5, width: 123, height: 45 };
  assert.deepEqual(plain(applyRatio(box, null, BOUNDS)), box);
});

test("a box on screen names the right part of the real picture", () => {
  const { toNaturalBox } = load();
  const shown = { x: 10, y: 20, width: 100, height: 50 };
  assert.deepEqual(
    plain(toNaturalBox(shown, { width: 400, height: 300 }, 1600, 1200)),
    {
      x: 40,
      y: 80,
      width: 400,
      height: 200,
    }
  );
});

test("a picture shown at its own size needs no scaling", () => {
  const { toNaturalBox } = load();
  const shown = { x: 3, y: 4, width: 20, height: 30 };
  assert.deepEqual(
    plain(toNaturalBox(shown, { width: 400, height: 300 }, 400, 300)),
    shown
  );
});

test("a natural box never runs past the picture's own edges", () => {
  const { toNaturalBox } = load();
  const shown = { x: 399, y: 299, width: 1, height: 1 };
  const real = toNaturalBox(shown, { width: 400, height: 300 }, 1600, 1200);

  assert.ok(real.x + real.width <= 1600, "inside the width");
  assert.ok(real.y + real.height <= 1200, "inside the height");
});

test("a picture with no size on screen does not divide by zero", () => {
  const { toNaturalBox } = load();
  const real = toNaturalBox(
    { x: 0, y: 0, width: 10, height: 10 },
    { width: 0, height: 0 },
    100,
    100
  );

  assert.ok(Number.isFinite(real.x) && Number.isFinite(real.width));
});

const START = { x: 100, y: 100, width: 200, height: 100 };

test("dragging inside the box moves it and leaves its size alone", () => {
  const { dragBox } = load();
  assert.deepEqual(plain(dragBox(START, null, 20, -30)), {
    x: 120,
    y: 70,
    width: 200,
    height: 100,
  });
});

test("the east handle moves the right edge only", () => {
  const { dragBox } = load();
  assert.deepEqual(plain(dragBox(START, "e", 50, 999)), {
    x: 100,
    y: 100,
    width: 250,
    height: 100,
  });
});

test("the west handle moves the left edge, so the right one stays put", () => {
  const { dragBox } = load();
  const out = plain(dragBox(START, "w", 40, 0));

  assert.equal(out.x, 140);
  assert.equal(out.width, 160);
  assert.equal(out.x + out.width, 300, "the right edge did not move");
});

test("a corner handle moves both of its edges", () => {
  const { dragBox } = load();
  assert.deepEqual(plain(dragBox(START, "se", 30, 40)), {
    x: 100,
    y: 100,
    width: 230,
    height: 140,
  });
});

test("dragging a handle past the far corner turns the box round", () => {
  const { dragBox } = load();
  const out = plain(dragBox(START, "e", -300, 0));

  assert.ok(out.width > 0, "the width stays a width");
  assert.equal(out.x, 0, "and the box is now to the left of where it started");
  assert.equal(out.width, 100);
});
