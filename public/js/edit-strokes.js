/**
 * Edit page strokes
 */
window.ImageForgeEditStrokes = (function () {
  "use strict";

  const TOOLS = {
    brush: { kind: "brush", erase: false },
    rect: { kind: "rect", erase: false },
    ellipse: { kind: "ellipse", erase: false },
    eraser: { kind: "brush", erase: true },
  };

  const TOOL_HINTS = {
    brush:
      "Paint over what should change. The brush size sets how wide the stroke is.",
    rect: "Drag a box over the part that should change.",
    ellipse: "Drag an oval over the part that should change.",
    eraser:
      "The eraser takes back part of what you painted, without undoing a whole stroke.",
  };

  /**
   * The line to print under the tool row for a tool.
   */
  function hintFor(tool) {
    return TOOL_HINTS[tool] || TOOL_HINTS.brush;
  }

  /**
   * What the prompt box asks for, per tool.
   */
  const TOOL_PLACEHOLDERS = {
    brush: "Describe what belongs in the area you brushed.",
    rect: "Describe what belongs in the box you drew.",
    ellipse: "Describe what belongs in the oval you drew.",
    eraser: "Describe what belongs in the area you painted.",
  };

  /**
   * The placeholder for a tool.
   */
  function placeholderFor(tool) {
    return TOOL_PLACEHOLDERS[tool] || TOOL_PLACEHOLDERS.brush;
  }

  /**
   * A new stroke for a tool, starting where the pointer went down.
   */
  function strokeFor(tool, width, point) {
    const chosen = TOOLS[tool] || TOOLS.brush;
    return {
      kind: chosen.kind,
      erase: chosen.erase,
      width: width,
      points: [point],
    };
  }

  /**
   * Carry a stroke on to where the pointer has moved.
   */
  function extendStroke(stroke, point) {
    if (stroke.kind === "brush") {
      stroke.points.push(point);
    } else {
      stroke.points[1] = point;
    }
    return stroke;
  }

  /**
   * The rectangle between two corners, whichever way they were dragged.
   */
  function rectFrom(from, to) {
    return {
      x: Math.min(from.x, to.x),
      y: Math.min(from.y, to.y),
      width: Math.abs(to.x - from.x),
      height: Math.abs(to.y - from.y),
    };
  }

  /**
   * The ellipse that fills the box between two corners.
   */
  function ellipseFrom(from, to) {
    const box = rectFrom(from, to);
    return {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
      radiusX: box.width / 2,
      radiusY: box.height / 2,
    };
  }

  /**
   * How a stroke goes onto the layer of what you have painted.
   */
  function strokeOps(stroke) {
    return stroke.erase ? "destination-out" : "source-over";
  }

  /**
   * How that layer is applied to the mask.
   */
  function maskOps(inverted) {
    return inverted ? "source-over" : "destination-out";
  }

  const TRANSPARENT_ENOUGH = 0.1;

  /**
   * Whether a picture is see-through enough to have been left unpainted.
   */
  function looksTransparent(pixels) {
    const data = (pixels && pixels.data) || [];
    if (!data.length) return false;

    let clear = 0;
    let seen = 0;
    for (let at = 3; at < data.length; at += 4) {
      if (data[at] < 128) clear += 1;
      seen += 1;
    }

    return seen > 0 && clear / seen > TRANSPARENT_ENOUGH;
  }

  const MASK_COLOUR = "#0f172a";

  /**
   * Draw one stroke onto a layer.
   */
  function drawStroke(into, item) {
    into.globalCompositeOperation = strokeOps(item);
    into.fillStyle = MASK_COLOUR;
    into.strokeStyle = MASK_COLOUR;
    into.lineWidth = item.width;
    into.lineCap = "round";
    into.lineJoin = "round";

    const first = item.points[0];
    const last = item.points[item.points.length - 1];
    if (!first) return;

    if (item.kind === "rect") {
      const box = rectFrom(first, last);
      into.beginPath();
      into.rect(box.x, box.y, box.width, box.height);
      into.fill();
      return;
    }

    if (item.kind === "ellipse") {
      const round = ellipseFrom(first, last);
      into.beginPath();
      into.ellipse(
        round.x,
        round.y,
        round.radiusX,
        round.radiusY,
        0,
        0,
        Math.PI * 2
      );
      into.fill();
      return;
    }

    into.beginPath();
    item.points.forEach(function (point, at) {
      if (at === 0) into.moveTo(point.x, point.y);
      else into.lineTo(point.x, point.y);
    });

    if (item.points.length === 1) {
      into.arc(first.x, first.y, item.width / 2, 0, Math.PI * 2);
      into.fill();
    } else {
      into.stroke();
    }
  }

  /**
   * Everything painted so far, on a layer of its own.
   */
  function drawStrokes(items, size) {
    const layer = document.createElement("canvas");
    layer.width = size.width;
    layer.height = size.height;

    const into = layer.getContext("2d");
    items.forEach(function (item) {
      drawStroke(into, item);
    });

    return layer;
  }

  return {
    hintFor,
    placeholderFor,
    strokeFor,
    extendStroke,
    rectFrom,
    ellipseFrom,
    strokeOps,
    maskOps,
    looksTransparent,
    drawStrokes,
    MASK_COLOUR,
  };
})();
