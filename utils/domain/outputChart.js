/**
 * The output chart
 */

"use strict";

const { costFrom, formatCost } = require("./cost");

/**
 * One row per day, with the day's images and what they cost.
 */
function byDay(rows, prices) {
  const days = new Map();

  for (const row of rows) {
    const seen = days.get(row.day) || { day: row.day, images: 0, cost: 0 };
    seen.images += row.images;

    const price = prices[row.model];
    if (price && row.images) {
      seen.cost += costFrom(row.inputTokens, row.outputTokens, price) || 0;
    }
    days.set(row.day, seen);
  }

  return [...days.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
}

/**
 * The bars, and the three figures printed beside them.
 */
function buildOutputChart(rows, prices, { days, height }) {
  const measured = byDay(rows, prices);

  const busiest = measured.reduce((most, row) => Math.max(most, row.images), 0);
  const images = measured.reduce((sum, row) => sum + row.images, 0);
  const cost = measured.reduce((sum, row) => sum + row.cost, 0);

  return {
    bars: measured.map((row) => {
      const scaled = busiest ? Math.round((row.images / busiest) * height) : 0;
      return {
        day: row.day,
        images: row.images,
        height: row.images > 0 ? Math.max(1, scaled) : 0,
      };
    }),
    images,
    spend: cost > 0 ? formatCost(cost) : null,
    perDay: images ? (images / days).toFixed(1) : "0",
    days,
    height,
  };
}

module.exports = { buildOutputChart };
