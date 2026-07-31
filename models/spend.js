/**
 * Spend model
 *
 * Adds to the count of what has been paid for, per model
 */

"use strict";

const { tokenCount } = require("../utils/domain/tokenCount");

/**
 * Build the spend model against a database connection.
 */
module.exports = (db) => {
  const stmts = {
    record: db.prepare(
      `INSERT INTO model_spend (
         model, images, counted_images, input_tokens, output_tokens, total_tokens
       ) VALUES (
         @model, @images, @counted_images, @input_tokens, @output_tokens, @total_tokens
       )
       ON CONFLICT(model) DO UPDATE SET
         images         = images + excluded.images,
         counted_images = counted_images + excluded.counted_images,
         input_tokens   = input_tokens + excluded.input_tokens,
         output_tokens  = output_tokens + excluded.output_tokens,
         total_tokens   = total_tokens + excluded.total_tokens`
    ),
  };

  /**
   * A token figure to add, treating an unreported one as nothing.
   */
  function tokens(usage, key) {
    if (!usage) return 0;
    const count = tokenCount(usage[key]);
    return count === null ? 0 : count;
  }

  return {
    /**
     * Record that the API produced this many images, and report how many.
     */
    recordGenerated({ model, usage = null, images = 1 }) {
      const many = Math.max(0, Math.floor(Number(images)) || 0);
      if (!many) return 0;

      stmts.record.run({
        model: String(model || ""),
        images: many,
        counted_images: usage ? many : 0,
        input_tokens: tokens(usage, "input"),
        output_tokens: tokens(usage, "output"),
        total_tokens: tokens(usage, "total"),
      });

      return many;
    },
  };
};
