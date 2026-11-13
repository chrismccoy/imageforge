/**
 * Crop geometry
 */
window.ImageForgeCropGeometry = (function () {
  "use strict";

  const MIN_SIDE = 16;

  /**
   * One side of a resized box held inside the picture: the edge the handle
   * moved is clamped, the other stays put.
   */
  function clampSide(from, to, size, movesStart) {
    from = Math.max(from, 0);
    to = Math.min(to, size);
    const length = Math.min(Math.max(to - from, MIN_SIDE), size);

    if (movesStart) {
      from = Math.max(to - length, 0);
      return { at: from, length: length };
    }
    return { at: Math.min(from, size - length), length: length };
  }

  /**
   * Hold a box inside the picture. A move keeps its size where that is
   * possible; a resize by a handle stops the edge it moved.
   */
  function clampBox(box, bounds, handle) {
    if (handle) {
      const across = clampSide(
        box.x,
        box.x + box.width,
        bounds.width,
        handle.indexOf("w") !== -1
      );
      const down = clampSide(
        box.y,
        box.y + box.height,
        bounds.height,
        handle.indexOf("n") !== -1
      );
      return {
        x: across.at,
        y: down.at,
        width: across.length,
        height: down.length,
      };
    }

    const width = Math.min(Math.max(box.width, MIN_SIDE), bounds.width);
    const height = Math.min(Math.max(box.height, MIN_SIDE), bounds.height);

    return {
      x: Math.min(Math.max(box.x, 0), bounds.width - width),
      y: Math.min(Math.max(box.y, 0), bounds.height - height),
      width: width,
      height: height,
    };
  }

  /**
   * Give a box a shape, or leave it alone when it is free. The n and s
   * handles set the height, the rest the width; the edges opposite the
   * handle stay put.
   */
  function applyRatio(box, ratio, bounds, handle) {
    if (!ratio) return clampBox(box, bounds, handle);

    const h = handle || "";
    const fromLeft = h.indexOf("w") !== -1;
    const fromTop = h.indexOf("n") !== -1;
    const right = box.x + box.width;
    const bottom = box.y + box.height;
    const roomX = !h ? bounds.width : fromLeft ? right : bounds.width - box.x;
    const roomY = !h ? bounds.height : fromTop ? bottom : bounds.height - box.y;

    let width = box.width;
    let height = width / ratio;
    if (h === "n" || h === "s") {
      height = box.height;
      width = height * ratio;
    }

    if (height > roomY) {
      height = roomY;
      width = height * ratio;
    }
    if (width > roomX) {
      width = roomX;
      height = width / ratio;
    }

    return clampBox(
      {
        x: fromLeft ? right - width : box.x,
        y: fromTop ? bottom - height : box.y,
        width: width,
        height: height,
      },
      bounds,
      handle
    );
  }

  /**
   * The part of the real picture a box on screen names.
   */
  function toNaturalBox(box, shown, naturalWidth, naturalHeight) {
    const across = shown.width ? naturalWidth / shown.width : 1;
    const down = shown.height ? naturalHeight / shown.height : 1;

    const x = Math.max(0, Math.round(box.x * across));
    const y = Math.max(0, Math.round(box.y * down));

    return {
      x: x,
      y: y,
      width: Math.min(Math.round(box.width * across), naturalWidth - x),
      height: Math.min(Math.round(box.height * down), naturalHeight - y),
    };
  }

  /**
   * A box moved or resized by a drag.
   */
  function dragBox(start, handle, dx, dy) {
    if (!handle) {
      return {
        x: start.x + dx,
        y: start.y + dy,
        width: start.width,
        height: start.height,
      };
    }

    let left = start.x;
    let top = start.y;
    let right = start.x + start.width;
    let bottom = start.y + start.height;

    if (handle.indexOf("w") !== -1) left += dx;
    if (handle.indexOf("e") !== -1) right += dx;
    if (handle.indexOf("n") !== -1) top += dy;
    if (handle.indexOf("s") !== -1) bottom += dy;

    return {
      x: Math.min(left, right),
      y: Math.min(top, bottom),
      width: Math.abs(right - left),
      height: Math.abs(bottom - top),
    };
  }

  return { clampBox, applyRatio, toNaturalBox, dragBox, MIN_SIDE };
})();
