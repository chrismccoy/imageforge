/**
 * Session setup
 */

"use strict";

const session = require("express-session");
const SqliteSessionStore = require("../db/sessionStore")(session);
const { env } = require("../config/env");
const { SESSION_MAX_AGE_MS } = require("../config/limits");

/**
 * Build the session middleware for the given database connection.
 */
function createSessionMiddleware(db, { secure } = {}) {
  const secureCookie =
    secure === undefined ? env.TRUST_PROXY || env.IS_PRODUCTION : secure;
  const store = new SqliteSessionStore(db);
  const middleware = session({
    store,
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookie,
      maxAge: SESSION_MAX_AGE_MS,
    },
  });
  middleware.store = store;
  return middleware;
}

module.exports = { createSessionMiddleware };
