/**
 * What a generate request costs
 */

"use strict";

const { normalizeCount, MODEL_TOKENS } = require("../config/images");

const COMPARE_IMAGES = MODEL_TOKENS.length;

/**
 * How many images a request is asking for.
 */
function costOfGenerate(req) {
  const body = (req && req.body) || {};
  if (body.compare) return COMPARE_IMAGES;
  return normalizeCount(body.count);
}

module.exports = { costOfGenerate, COMPARE_IMAGES };
