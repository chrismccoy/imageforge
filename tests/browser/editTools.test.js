/**
 * Mask tools
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const FILE = path.join(__dirname, "..", "..", "public", "js", "edit-strokes.js");

function recordingContext(calls) {
  const note = (name) =>
    function () {
      calls.push(name);
    };

  return {
    calls,
    globalCompositeOperation: "",
    fillStyle: "",
    lineWidth: 0,
    lineCap: "",
    lineJoin: "",
    filter: "",
    set globalCompositeOperationTracked(value) {
      calls.push("op:" + value);
    },
    fillRect: note("fillRect"),
    clearRect: note("clearRect"),
    beginPath: note("beginPath"),
    moveTo: note("moveTo"),
    lineTo: note("lineTo"),
    stroke: note("stroke"),
    fill: note("fill"),
    arc: note("arc"),
    rect: note("rect"),
    ellipse: note("ellipse"),
    drawImage: note("drawImage"),
  };
}

function load() {
  const calls = [];

  const context = recordingContext(calls);
  const ops = [];
  const tracked = new Proxy(context, {
    set(target, key, value) {
      if (key === "globalCompositeOperation") ops.push(value);
      target[key] = value;
      return true;
    },
  });

  const stubEl = () => ({
    getContext: () => tracked,
    addEventListener() {},
    classList: { add() {}, remove() {}, toggle() {} },
    style: {},
    width: 100,
    height: 100,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    querySelectorAll: () => [],
    setAttribute() {},
    getAttribute: () => null,
  });

  const sandbox = {
    document: { createElement: () => stubEl() },
    window: {},
  };
  vm.runInNewContext(fs.readFileSync(FILE, "utf8"), sandbox);

  return Object.assign({ calls, ops }, sandbox.window.ImageForgeEditStrokes);
}

function plain(box) {
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

test("a rectangle dragged up and to the left is still a rectangle", () => {
  const { rectFrom } = load();
  const box = rectFrom({ x: 90, y: 80 }, { x: 20, y: 30 });

  assert.deepEqual(plain(box), { x: 20, y: 30, width: 70, height: 50 });
});

test("a rectangle dragged the usual way is unchanged", () => {
  const { rectFrom } = load();
  assert.deepEqual(plain(rectFrom({ x: 10, y: 10 }, { x: 40, y: 30 })), {
    x: 10,
    y: 10,
    width: 30,
    height: 20,
  });
});

test("an ellipse fills the box that was dragged", () => {
  const { ellipseFrom } = load();
  const round = ellipseFrom({ x: 0, y: 0 }, { x: 100, y: 40 });

  assert.equal(round.x, 50, "its middle is the middle of the box");
  assert.equal(round.y, 20);
  assert.equal(round.radiusX, 50, "and it touches each side");
  assert.equal(round.radiusY, 20);
});

test("a shape with no drag at all has no size, rather than a negative one", () => {
  const { rectFrom, ellipseFrom } = load();
  const flat = rectFrom({ x: 5, y: 5 }, { x: 5, y: 5 });
  const round = ellipseFrom({ x: 5, y: 5 }, { x: 5, y: 5 });

  assert.equal(flat.width, 0);
  assert.ok(round.radiusX >= 0 && round.radiusY >= 0);
});

test("a stroke remembers which tool drew it", () => {
  const { strokeFor } = load();

  assert.equal(strokeFor("brush", 10, { x: 1, y: 2 }).kind, "brush");
  assert.equal(strokeFor("rect", 10, { x: 1, y: 2 }).kind, "rect");
  assert.equal(strokeFor("ellipse", 10, { x: 1, y: 2 }).kind, "ellipse");
});

test("the eraser is a brush that takes away", () => {
  const { strokeFor } = load();
  const rubber = strokeFor("eraser", 10, { x: 1, y: 2 });

  assert.equal(rubber.kind, "brush", "it is the same shape as the brush");
  assert.equal(rubber.erase, true, "and it subtracts rather than adds");
});

test("a brush does not erase", () => {
  const { strokeFor } = load();
  assert.equal(strokeFor("brush", 10, { x: 1, y: 2 }).erase, false);
});

test("a tool nobody offers falls back to the brush", () => {
  const { strokeFor } = load();
  assert.equal(strokeFor("spraycan", 10, { x: 1, y: 2 }).kind, "brush");
});

test("every tool has a line of its own", () => {
  const { hintFor } = load();
  const said = ["brush", "rect", "ellipse", "eraser"].map(hintFor);

  said.forEach((line, i) => assert.ok(line, `${i} has something to say`));
  assert.equal(new Set(said).size, 4, "and no two tools say the same thing");
});

test("the eraser still explains that it takes paint back", () => {
  const { hintFor } = load();
  assert.match(hintFor("eraser"), /takes back/);
});

test("a tool nobody offers is described as the brush", () => {
  const { hintFor } = load();
  assert.equal(hintFor("spraycan"), hintFor("brush"));
});

test("strokes go onto the layer in the order they were made", () => {
  const { drawStrokes, ops } = load();
  ops.length = 0;

  drawStrokes(
    [
      { kind: "brush", erase: false, width: 10, points: [{ x: 1, y: 1 }] },
      { kind: "brush", erase: true, width: 10, points: [{ x: 1, y: 1 }] },
      {
        kind: "rect",
        erase: false,
        width: 10,
        points: [
          { x: 0, y: 0 },
          { x: 5, y: 5 },
        ],
      },
    ],
    { width: 100, height: 100 }
  );

  assert.deepEqual(ops.slice(0, 3), [
    "source-over",
    "destination-out",
    "source-over",
  ]);
});

test("a shape keeps two corners however far it is dragged", () => {
  const { strokeFor, extendStroke } = load();

  let shape = strokeFor("rect", 10, { x: 0, y: 0 });
  shape = extendStroke(shape, { x: 5, y: 5 });
  shape = extendStroke(shape, { x: 40, y: 30 });

  assert.equal(shape.points.length, 2, "a corner each, not a trail");
  assert.deepEqual(plain(Object.assign({ width: 0, height: 0 }, shape.points[1])), {
    x: 40,
    y: 30,
    width: 0,
    height: 0,
  });
});

test("a brush keeps every point, because the trail is the stroke", () => {
  const { strokeFor, extendStroke } = load();

  let line = strokeFor("brush", 10, { x: 0, y: 0 });
  line = extendStroke(line, { x: 5, y: 5 });
  line = extendStroke(line, { x: 9, y: 9 });

  assert.equal(line.points.length, 3);
});

test("an eraser takes away from the layer, and a brush adds to it", () => {
  const { strokeOps } = load();

  const adding = strokeOps({ kind: "brush", erase: false, width: 10, points: [] });
  const taking = strokeOps({ kind: "brush", erase: true, width: 10, points: [] });

  assert.equal(adding, "source-over", "a brush puts paint down");
  assert.equal(taking, "destination-out", "an eraser lifts it off");
});

test("the mask is the hole the painting makes, unless it is inverted", () => {
  const { maskOps } = load();

  assert.equal(
    maskOps(false),
    "destination-out",
    "normally the painted part is what may change, so it is cut out"
  );
  assert.equal(
    maskOps(true),
    "source-over",
    "inverted, the painted part is the only part kept, so it is drawn"
  );
});

test("a picture with no transparency needs no flattening", () => {
  const { looksTransparent } = load();
  const opaque = { data: [9, 9, 9, 255, 9, 9, 9, 255, 9, 9, 9, 255, 9, 9, 9, 255] };

  assert.equal(looksTransparent(opaque), false);
});

test("a picture that is mostly holes does", () => {
  const { looksTransparent } = load();
  const holes = { data: [0, 0, 0, 0, 0, 0, 0, 0, 9, 9, 9, 255, 0, 0, 0, 0] };

  assert.equal(looksTransparent(holes), true);
});

test("a stray soft edge is not treated as a hole", () => {
  const { looksTransparent } = load();
  const data = [];
  for (let i = 0; i < 20; i++) data.push(9, 9, 9, i === 0 ? 0 : 255);

  assert.equal(looksTransparent({ data }), false);
});

test("nothing at all is not transparent, rather than an error", () => {
  const { looksTransparent } = load();
  assert.equal(looksTransparent(null), false);
  assert.equal(looksTransparent({ data: [] }), false);
});

test("each tool has its own placeholder", () => {
  const { placeholderFor } = load();
  const said = ["brush", "rect", "ellipse", "eraser"].map(placeholderFor);

  assert.equal(new Set(said).size, 4, said.join(" | "));
  said.forEach(function (line) {
    assert.match(line, /^Describe what belongs/, line);
  });
});

test("the box and the oval are named by the shape you dragged", () => {
  const { placeholderFor } = load();

  assert.match(placeholderFor("rect"), /box/);
  assert.match(placeholderFor("ellipse"), /oval/);
  assert.doesNotMatch(placeholderFor("rect"), /brushed/);
  assert.doesNotMatch(placeholderFor("ellipse"), /brushed/);
});

test("the eraser does not claim you brushed the area", () => {
  const { placeholderFor } = load();
  assert.doesNotMatch(placeholderFor("eraser"), /brushed/);
});

test("an unknown tool falls back to the brush's placeholder", () => {
  const { placeholderFor } = load();
  assert.equal(placeholderFor("spraycan"), placeholderFor("brush"));
});

test("the page's own placeholder is the brush's", () => {
  const { placeholderFor } = load();
  const view = fs.readFileSync(
    path.join(__dirname, "..", "..", "views", "edit.ejs"),
    "utf8"
  );
  const found = /<textarea id="prompt"[^>]*placeholder="([^"]*)"/.exec(view);

  assert.ok(found, "no placeholder on the prompt textarea");
  assert.equal(found[1], placeholderFor("brush"));
});
