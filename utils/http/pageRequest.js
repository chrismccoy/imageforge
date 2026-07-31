/**
 * Page requests
 */

"use strict";

const { env } = require("../../config/env");
const {
  DEFAULT_PAGE_SIZE,
  MIN_PAGE_SIZE,
  MAX_PAGE_SIZE,
} = require("../../config/limits");
const { paginate } = require("./paginate");

/**
 * Per page size to use, the saved setting first, then the env value, fallback to default
 */
function resolvePageSize(settingValue, envValue) {
  for (const candidate of [settingValue, envValue, DEFAULT_PAGE_SIZE]) {
    const n = Math.floor(Number(candidate));
    if (Number.isFinite(n) && n >= MIN_PAGE_SIZE) {
      return Math.min(n, MAX_PAGE_SIZE);
    }
  }
  return DEFAULT_PAGE_SIZE;
}

/**
 * The page size, page number, and slice offset for a list of `total` rows.
 */
function readPaging(req, settings, total, envPageSize = env.GENERATIONS_PER_PAGE) {
  const pageSize = resolvePageSize(settings && settings.page_size, envPageSize);
  const rawPage = (req.params && req.params.page) || (req.query && req.query.page);

  return { pageSize, ...paginate({ total, pageSize, rawPage }) };
}

module.exports = { readPaging, resolvePageSize };
