/**
 * Error and not found handling
 */

"use strict";

const { respond } = require("../utils/http/http");
const { notFound, errorPage } = require("../utils/http/pages");

/**
 * Handle a route that matched nothing.
 */
function notFoundHandler(req, res) {
  return respond(req, res, {
    status: 404,
    message: "Not found.",
    html: () => notFound(res),
  });
}

/**
 * The error's own HTTP status when it is a 4xx or 5xx, else 500.
 */
function statusOf(err) {
  const status = err && err.status;
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}

/**
 * Build the handler for any error thrown while serving a request.
 */
function createErrorHandler({ log = console } = {}) {
  return function errorHandler(err, req, res, next) {
    const status = statusOf(err);
    if (status < 500) {
      log.warn(`Request error ${status}:`, err.message);
    } else {
      log.error("Unhandled error:", err && err.stack ? err.stack : err);
    }
    if (res.headersSent) {
      return next(err);
    }
    const message = err && err.expose ? err.message : "Server error.";
    return respond(req, res, {
      status,
      message,
      html: () => errorPage(res, status),
    });
  };
}

module.exports = { notFoundHandler, createErrorHandler };
