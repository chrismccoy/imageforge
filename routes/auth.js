/**
 * Auth routes
 *
 * Login and logout
 */

"use strict";

const express = require("express");
const buildController = require("../controllers/authController");
const { rateLimit } = require("../middleware/rateLimit");

module.exports = (deps) => {
  const ctrl = buildController(deps);
  const router = express.Router();

  const loginLimiter = rateLimit({
    ...deps.limits.rate.login,
    message: "Too many attempts. Try again later.",
  });

  router.get("/login", ctrl.showLogin);
  router.post("/login", loginLimiter, ctrl.login);
  router.post("/logout", ctrl.logout);

  return router;
};
