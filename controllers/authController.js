/**
 * Auth controller
 */

"use strict";

const { safeEqual } = require("../utils/security/secureCompare");
const { PAGES } = require("../config/urls");
const { field } = require("../utils/http/request");
const { errorPage } = require("../utils/http/pages");
const { VIEWS } = require("../config/views");
const { env } = require("../config/env");

/**
 * Build the auth controller.
 */
module.exports = ({ adminAccount = env } = {}) => {
  const expectedUser = adminAccount.ADMIN_USERNAME;
  const expectedPass = adminAccount.ADMIN_PASSWORD;

  return {
    /**
     * Show the login page, or send an already logged in user to the home page.
     */
    showLogin(req, res) {
      if (req.session && req.session.authed) {
        return res.redirect(PAGES.dashboard);
      }
      res.render(VIEWS.LOGIN, { title: "Log in", error: null });
    },

    /**
     * Check the submitted username and password.
     */
    login(req, res) {
      const user = field(req.body, "username", { trim: false });
      const pass = field(req.body, "password", { trim: false });

      const ok =
        Boolean(expectedPass) &&
        safeEqual(user, expectedUser) &&
        safeEqual(pass, expectedPass);

      if (ok) {
        return req.session.regenerate((err) => {
          if (err) {
            return errorPage(res);
          }
          req.session.authed = true;
          res.redirect(PAGES.dashboard);
        });
      }

      res.status(401).render(VIEWS.LOGIN, {
        title: "Log in",
        error: "Wrong username or password.",
      });
    },

    /**
     * Clear the session and return to the login page.
     */
    logout(req, res) {
      req.session.destroy(() => res.redirect(PAGES.login));
    },
  };
};
