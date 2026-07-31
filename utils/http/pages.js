/**
 * Standard pages
 */

"use strict";

const { VIEWS } = require("../../config/views");

/**
 * The access denied page, with a 403.
 */
function denied(res) {
  return res.status(403).render(VIEWS.DENIED, { title: "Access denied" });
}

/**
 * The ordinary not found page, with a 404.
 */
function notFound(res) {
  return res.status(404).render(VIEWS.NOTFOUND, { title: "Not found", active: "" });
}

/**
 * The public not found page, with a 404.
 */
function shareNotFound(res) {
  return res
    .status(404)
    .render(VIEWS.SHARE_NOTFOUND, { title: "Not found", noindex: true });
}

/**
 * The error page
 */
function errorPage(res, status = 500) {
  return res
    .status(status)
    .render(VIEWS.ERROR, { title: "Something went wrong", active: "" });
}

module.exports = { denied, notFound, shareNotFound, errorPage };
