/**
 * Model prices
 */

"use strict";

/**
 * Whether a rate is one we are willing to store.
 *
 * Zero is allowed. A free model is a real thing, and refusing zero would make
 * it indistinguishable from never having been priced.
 */
function validRate(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Build the model price model against a database connection.
 */
module.exports = (db) => {
  const stmts = {
    all: db.prepare(
      "SELECT model, input_per_million, output_per_million, updated_at FROM model_prices"
    ),
    upsert: db.prepare(
      `INSERT INTO model_prices (model, input_per_million, output_per_million, updated_at)
       VALUES (@model, @input, @output, @updated_at)
       ON CONFLICT(model) DO UPDATE SET
         input_per_million = @input,
         output_per_million = @output,
         updated_at = @updated_at`
    ),
    remove: db.prepare("DELETE FROM model_prices WHERE model = ?"),
    latest: db.prepare("SELECT MAX(updated_at) AS at FROM model_prices"),
  };

  return {
    /**
     * Every price, keyed by the model name a generation stores.
     */
    all() {
      const out = {};
      for (const row of stmts.all.all()) {
        out[row.model] = {
          input: row.input_per_million,
          output: row.output_per_million,
          updatedAt: row.updated_at,
        };
      }
      return out;
    },

    /**
     * Store a rate pair, replacing any existing one. Reports whether it took.
     */
    set(model, input, output, nowIso) {
      const name = String(model || "").trim();
      if (!name || !validRate(input) || !validRate(output)) return false;

      stmts.upsert.run({ model: name, input, output, updated_at: nowIso });
      return true;
    },

    /**
     * Forget a model's price.
     */
    clear(model) {
      return stmts.remove.run(String(model || "").trim()).changes > 0;
    },

    /**
     * Apply what a form said about one model's rates.
     */
    applyRates(model, inputText, outputText, nowIso) {
      const input = String(inputText == null ? "" : inputText).trim();
      const output = String(outputText == null ? "" : outputText).trim();

      if (!input && !output) return this.clear(model);
      return this.set(model, Number(input), Number(output), nowIso);
    },

    /**
     * When any price was last saved, or null when none has been.
     */
    updatedAt() {
      return stmts.latest.get().at || null;
    },
  };
};
