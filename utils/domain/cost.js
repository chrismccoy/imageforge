/**
 * Cost
 */

"use strict";

const { tokenCount } = require("./tokenCount");
const { formatTokens } = require("./usage");

const TOKENS_PER_UNIT = 1e6;

const PLACES_UNDER_A_DOLLAR = 3;
const PLACES = 2;

/**
 * The cost of a number of tokens at a rate pair, or null when unknowable.
 */
function costFrom(inputTokens, outputTokens, price) {
  const input = tokenCount(inputTokens);
  const output = tokenCount(outputTokens);
  if (input === null || output === null) return null;

  if (
    !price ||
    tokenCount(price.input) === null ||
    tokenCount(price.output) === null
  ) {
    return null;
  }

  return (
    (input / TOKENS_PER_UNIT) * price.input +
    (output / TOKENS_PER_UNIT) * price.output
  );
}

/**
 * The cost of one saved generation at a rate pair.
 */
function costOf(row, price) {
  if (!row) return null;
  return costFrom(row.usage_input_tokens, row.usage_output_tokens, price);
}

/**
 * A cost as text, or null when there is no cost to show.
 */
function formatCost(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  if (value === 0) return "$0.00";
  return "$" + value.toFixed(value < 1 ? PLACES_UNDER_A_DOLLAR : PLACES);
}

/**
 * What the dashboard says about each model it has spent on.
 */
function costedModels(rows, prices) {
  return rows.map((row) => {
    const cost = row.countedImages
      ? costFrom(row.inputTokens, row.outputTokens, prices[row.model])
      : null;

    return Object.assign({}, row, {
      label: row.model || "uploaded",
      cost: formatCost(cost),
      rawCost: cost,
      tokens: row.countedImages ? formatTokens(row.totalTokens) : null,
      partial: row.countedImages > 0 && row.countedImages < row.images,
    });
  });
}

module.exports = { costFrom, costOf, formatCost, costedModels };
