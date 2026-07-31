/**
 * What a generations request is asking for
 */

"use strict";

const { field } = require("../../../utils/http/request");
const { likePattern } = require("../../../utils/domain/search");
const { pageLink } = require("../../../utils/http/pageLink");
const { PAGES } = require("../../../config/urls");

const LAYOUTS = ["grid", "list"];

/**
 * The layout this link explicitly asked for, or "" for no opinion.
 */
function askedView(req) {
  const asked = field(req.query, "view");
  return LAYOUTS.includes(asked) ? asked : "";
}

/**
 * Which layout to draw: what the link asked for, else what is stored.
 */
function readView(req) {
  return (
    askedView(req) || (req.settings && req.settings.list_view ? "list" : "grid")
  );
}

/**
 * What the request is asking to see.
 */
function readCriteria(req) {
  const q = field(req.query, "q");
  const favorite = Boolean(field(req.query, "fav"));

  return {
    q,
    search: likePattern(q),
    favorite,
    fav: favorite ? "1" : "",
    collection: field(req.query, "collection"),
    promptFilter: field(req.query, "prompt"),
    view: readView(req),
    viewAsked: askedView(req),
  };
}

/**
 * Which layout to show, and which one the button offers.
 */
function layout(criteria) {
  return {
    view: criteria.view,
    otherView: criteria.view === "list" ? "grid" : "list",
  };
}

const CARRIED = ["q", "fav", "collection", "prompt"];

/**
 * Those filters, read off a posted form.
 */
function carriedFrom(body) {
  return Object.fromEntries(CARRIED.map((key) => [key, field(body, key)]));
}

/**
 * Those filters, as this request has them.
 */
function carriedValues(criteria) {
  const from = {
    q: criteria.q,
    fav: criteria.fav,
    collection: criteria.collection,
    prompt: criteria.promptFilter,
  };
  return Object.fromEntries(CARRIED.map((key) => [key, from[key]]));
}

/**
 * The URLs the list page's own controls point at.
 */
function listLinks(criteria, page) {
  const carried = { ...carriedValues(criteria), view: criteria.viewAsked };

  return {
    prevUrl: pageLink(PAGES.generations, page - 1, carried),
    nextUrl: pageLink(PAGES.generations, page + 1, carried),
    favUrl: pageLink(PAGES.generations, 1, {
      ...carried,
      fav: criteria.favorite ? "" : "1",
    }),
  };
}

module.exports = {
  LAYOUTS,
  CARRIED,
  readCriteria,
  layout,
  carriedFrom,
  carriedValues,
  listLinks,
};
