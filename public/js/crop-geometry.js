/**
 * Crop geometry
 */
window.ImageForgeCropGeometry = (function () {
  "use strict";

  const MIN_SIDE = 16;

  /**
   * Hold a box inside the picture, keeping its size where that is possible.
   */
  function clampBox(box, bounds) {
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
   * Give a box a shape, or leave it alone when it is free.
   */
  function applyRatio(box, ratio, bounds) {
    if (!ratio) return clampBox(box, bounds);

    let width = box.width;
    let height = width / ratio;

    if (height > bounds.height) {
      height = bounds.height;
      width = height * ratio;
    }
    if (width > bounds.width) {
      width = bounds.width;
      height = width / ratio;
    }

    return clampBox({ x: box.x, y: box.y, width: width, height: height }, bounds);
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
