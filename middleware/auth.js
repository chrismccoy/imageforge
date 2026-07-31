/**
 * Auth guard
 *
 * Blocks routes that need a login.
 */

"use strict";

const { respond } = require("../utils/http/http");
const { PAGES } = require("../config/urls");

/**
 * Let logged in requests through, otherwise send to login or return 401 JSON.
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.authed) {
    return next();
  }
  return respond(req, res, {
    status: 401,
    message: "Not authenticated.",
    html: () => res.redirect(PAGES.login),
  });
}

module.exports = { requireAuth };
