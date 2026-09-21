/**
 * Mask editor zoom tests
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

test("fit has no width of its own, so the stylesheet keeps deciding", () => {
  const { zoomWidth } = load();
  assert.equal(zoomWidth("fit", 1024), null);
});

test("100% is one image pixel to one screen pixel", () => {
  const { zoomWidth } = load();
  assert.equal(zoomWidth(1, 1024), 1024);
});

test("each step multiplies the image's own width", () => {
  const { zoomWidth } = load();
  assert.equal(zoomWidth(2, 1024), 2048);
  assert.equal(zoomWidth(4, 1024), 4096);
});

test("an image whose size is not known yet stays at fit", () => {
  const { zoomWidth } = load();
  assert.equal(zoomWidth(2, 0), null, "no natural width, nothing to multiply");
  assert.equal(zoomWidth(2, NaN), null);
});

test("every level has a label to show on the button row", () => {
  const { zoomLabel } = load();
  assert.equal(zoomLabel("fit"), "Fit");
  assert.equal(zoomLabel(1), "100%");
  assert.equal(zoomLabel(2), "200%");
  assert.equal(zoomLabel(4), "400%");
});

function fakeView(width, height, clientWidth, clientHeight) {
  return {
    width,
    height,
    clientWidth,
    clientHeight,
    scrollLeft: 0,
    scrollTop: 0,
    read() {
      return {
        scrollLeft: this.scrollLeft,
        scrollTop: this.scrollTop,
        clientWidth: this.clientWidth,
        clientHeight: this.clientHeight,
        width: this.width,
        height: this.height,
      };
    },
    setWidth(px) {
      const shape = this.height / this.width;
      this.width = px === null ? this.clientWidth : px;
      this.height = this.width * shape;
      this.scrollLeft = Math.min(
        this.scrollLeft,
        Math.max(0, this.width - this.clientWidth)
      );
      this.scrollTop = Math.min(
        this.scrollTop,
        Math.max(0, this.height - this.clientHeight)
      );
    },
    setScroll(left, top) {
      this.scrollLeft = left;
      this.scrollTop = top;
    },
  };
}

test("zooming out reckons from where the scroll was, not where the browser put it", () => {
  const { zoomStage } = load();
  const view = fakeView(5016, 5016, 657, 561);
  view.scrollLeft = 2180;

  zoomStage(view, 2508);

  assert.equal(view.scrollLeft, 925.75);
});

test("zooming in keeps what was in the middle in the middle", () => {
  const { recentre } = load();
  assert.equal(recentre(250, 500, 1000, 2000), 750);
});

test("zooming out stops at the right hand edge", () => {
  const { recentre } = load();
  assert.equal(recentre(1500, 500, 2000, 1000), 500);
});

test("the scroll never goes negative", () => {
  const { recentre } = load();
  assert.equal(recentre(0, 500, 1000, 400), 0);
});

test("a stage with no width yet scrolls to the start", () => {
  const { recentre } = load();
  assert.equal(recentre(120, 500, 0, 2000), 0);
});

test("the middle of two fingers is between them", () => {
  const { centreOf } = load();
  const middle = centreOf([
    { x: 0, y: 0 },
    { x: 100, y: 50 },
  ]);
  assert.equal(middle.x, 50);
  assert.equal(middle.y, 25);
});

test("one finger has a middle of its own, which is where it is", () => {
  const { centreOf } = load();
  const middle = centreOf([{ x: 12, y: 34 }]);
  assert.equal(middle.x, 12);
  assert.equal(middle.y, 34);
});

test("no fingers is the origin, rather than a division by zero", () => {
  const { centreOf } = load();
  const middle = centreOf([]);
  assert.ok(Number.isFinite(middle.x) && Number.isFinite(middle.y));
});

test("the picture follows the fingers, so it moves the way they do", () => {
  const { panBy } = load();

  const scroll = panBy({ left: 200, top: 100 }, { x: 10, y: 10 }, { x: 40, y: 25 });
  assert.equal(scroll.left, 170);
  assert.equal(scroll.top, 85);
});

test("a pan stops at the edges rather than running past them", () => {
  const { panBy } = load();

  const atStart = panBy({ left: 5, top: 5 }, { x: 0, y: 0 }, { x: 50, y: 50 });
  assert.equal(atStart.left, 0, "there is nothing to the left of the start");
  assert.equal(atStart.top, 0);
});

test("a fresh first finger forgets any that were left behind", () => {
  const { noteTouch } = load();
  const touches = new Map();

  noteTouch(touches, { pointerId: 1, isPrimary: true, clientX: 0, clientY: 0 });
  noteTouch(touches, { pointerId: 2, isPrimary: false, clientX: 10, clientY: 0 });

  const panning = noteTouch(touches, {
    pointerId: 9,
    isPrimary: true,
    clientX: 5,
    clientY: 5,
  });

  assert.equal(touches.size, 1, "only the finger that is really down");
  assert.equal(panning, false, "so it paints rather than pans");
});

test("a second finger on the same gesture is a pan", () => {
  const { noteTouch } = load();
  const touches = new Map();

  const first = noteTouch(touches, {
    pointerId: 1,
    isPrimary: true,
    clientX: 0,
    clientY: 0,
  });
  const second = noteTouch(touches, {
    pointerId: 2,
    isPrimary: false,
    clientX: 40,
    clientY: 0,
  });

  assert.equal(first, false, "one finger paints");
  assert.equal(second, true, "two pan");
  assert.equal(touches.size, 2);
});
