/**
 * Stats
 *
 * The aggregate queries behind the usage page.
 */

"use strict";

const { DAY_MS } = require("../utils/domain/time");

/**
 * Build the stats model against a database connection.
 */
module.exports = (db) => {
  const stmts = {
    total: db.prepare("SELECT COUNT(*) AS n FROM generations"),
    since: db.prepare(
      "SELECT COUNT(*) AS n FROM generations WHERE created_at >= ?"
    ),
    byModel: db.prepare(
      `SELECT model, images, counted_images, input_tokens, output_tokens, total_tokens
       FROM model_spend
       ORDER BY images DESC, model ASC`
    ),
    perDay: db.prepare(
      `SELECT date(created_at) AS day,
              model,
              COUNT(*) AS images,
              SUM(COALESCE(usage_input_tokens, 0)) AS input_tokens,
              SUM(COALESCE(usage_output_tokens, 0)) AS output_tokens
       FROM generations
       WHERE created_at >= ?
       GROUP BY day, model
       ORDER BY day ASC`
    ),
  };

  return {
    /**
     * How many saved images there are.
     */
    total() {
      return stmts.total.get().n;
    },

    /**
     * How many were saved at or after a moment.
     */
    countSince(iso) {
      return stmts.since.get(String(iso)).n;
    },

    /**
     * Images and tokens per model
     */
    byModel() {
      return stmts.byModel.all().map((row) => ({
        model: row.model,
        images: row.images,
        countedImages: row.counted_images,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        totalTokens: row.total_tokens,
      }));
    },

    /**
     * Images and tokens per day, one row per model per day.
     */
    perDay(days, now = new Date()) {
      const first = new Date(now.getTime() - (days - 1) * DAY_MS);
      const from = first.toISOString().slice(0, 10);

      const found = stmts.perDay.all(`${from}T00:00:00.000Z`).map((row) => ({
        day: row.day,
        model: row.model || null,
        images: row.images,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
      }));

      const empty = [];
      for (let step = 0; step < days; step += 1) {
        const at = new Date(first.getTime() + step * DAY_MS);
        const day = at.toISOString().slice(0, 10);
        if (!found.some((row) => row.day === day)) {
          empty.push({
            day,
            model: null,
            images: 0,
            inputTokens: 0,
            outputTokens: 0,
          });
        }
      }

      return found
        .concat(empty)
        .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
    },
  };
};
