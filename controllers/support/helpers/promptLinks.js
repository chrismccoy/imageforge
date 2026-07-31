/**
 * The URLs the prompts list's own controls point at
 */

"use strict";

const { pageLink } = require("../../../utils/http/pageLink");
const { PAGES } = require("../../../config/urls");

const CARRIED = ["q", "category"];

/**
 * The sort links and the pager links for one page of the prompts list.
 */
function promptLinks({ q, category, sort }, page) {
  const carried = Object.fromEntries(
    CARRIED.map((key) => [key, { q, category }[key]])
  );

  return {
    nameSortUrl: pageLink(PAGES.prompts, 1, carried),
    ratingSortUrl: pageLink(PAGES.prompts, 1, { ...carried, sort: "rating" }),

    prevUrl: pageLink(PAGES.prompts, page - 1, { ...carried, sort }),
    nextUrl: pageLink(PAGES.prompts, page + 1, { ...carried, sort }),
  };
}

module.exports = { promptLinks, CARRIED };
