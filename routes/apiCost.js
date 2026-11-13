/**
 * What a generate request costs
 */

"use strict";

const { normalizeCount, COMPARE_IMAGES } = require("../config/images");
const { parseFlag } = require("../utils/domain/coerce");

/**
 * How many images a request is asking for.
 */
function costOfGenerate(req) {
  const body = (req && req.body) || {};
  if (parseFlag(body.compare)) return COMPARE_IMAGES;
  return normalizeCount(body.count);
}

module.exports = { costOfGenerate, COMPARE_IMAGES };
