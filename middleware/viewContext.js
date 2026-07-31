/**
 * View context
 */

"use strict";

/**
 * Expose the signed in state to every template.
 */
function viewContext(req, res, next) {
  res.locals.canManage = Boolean(req.session && req.session.authed);
  next();
}

module.exports = { viewContext };
