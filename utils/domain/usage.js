/**
 * Token usage
 */

"use strict";

const { tokenCount } = require("./tokenCount");

/**
 * An object's property, tolerating the object being absent or not an object.
 */
function pick(source, key) {
  return source && typeof source === "object" ? source[key] : undefined;
}

/**
 * The token counts from an image API response, or null when it carries none.
 */
function readUsage(payload) {
  const usage = pick(payload, "usage");
  if (!usage || typeof usage !== "object") return null;

  const input = pick(usage, "input_tokens_details");
  const output = pick(usage, "output_tokens_details");

  return {
    total: tokenCount(pick(usage, "total_tokens")),
    input: tokenCount(pick(usage, "input_tokens")),
    output: tokenCount(pick(usage, "output_tokens")),
    inputText: tokenCount(pick(input, "text_tokens")),
    inputImage: tokenCount(pick(input, "image_tokens")),
    outputText: tokenCount(pick(output, "text_tokens")),
    outputImage: tokenCount(pick(output, "image_tokens")),
  };
}

const USAGE_FIELDS = [
  "total",
  "input",
  "output",
  "inputText",
  "inputImage",
  "outputText",
  "outputImage",
];

/**
 * One batch's usage divided into a share per image.
 */
function splitUsage(usage, n) {
  const parts = Math.max(1, Math.floor(Number(n)) || 1);
  if (!usage) return Array.from({ length: parts }, () => null);

  return Array.from({ length: parts }, (_unused, index) => {
    const share = {};

    for (const key of USAGE_FIELDS) {
      const whole = tokenCount(usage[key]);
      if (whole === null) {
        share[key] = null;
        continue;
      }
      const each = Math.floor(whole / parts);
      share[key] = index === 0 ? whole - each * (parts - 1) : each;
    }

    return share;
  });
}

/**
 * A token count as text for display, or null when there is nothing to show.
 */
function formatTokens(value) {
  const n = tokenCount(value);
  return n === null ? null : n.toLocaleString("en-US");
}

module.exports = { readUsage, splitUsage, formatTokens };
