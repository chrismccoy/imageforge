/**
 * Aspect ratios
 */

"use strict";

/**
 * The greatest common divisor, for reducing 1024x1536 to 2:3.
 */
function greatestCommonDivisor(a, b) {
  return b ? greatestCommonDivisor(b, a % b) : a;
}

/**
 * A size string as its width and height, or null if it is not one.
 */
function sidesOf(size) {
  const found = /^(\d+)x(\d+)$/.exec(String(size == null ? "" : size).trim());
  if (!found) return null;

  const width = Number(found[1]);
  const height = Number(found[2]);
  return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * The distinct shapes among some sizes, in the order they first appear.
 */
function aspectsFrom(sizes) {
  const seen = new Set();
  const shapes = [];

  (sizes || []).forEach((size) => {
    const sides = sidesOf(size);
    if (!sides) return;

    const divisor = greatestCommonDivisor(sides.width, sides.height);
    const label = `${sides.width / divisor}:${sides.height / divisor}`;
    if (seen.has(label)) return;

    seen.add(label);
    shapes.push({ label, ratio: sides.width / sides.height });
  });

  return shapes;
}

module.exports = { aspectsFrom };
