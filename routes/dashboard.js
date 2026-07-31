/**
 * Dashboard route
 */

"use strict";

const express = require("express");
const buildController = require("../controllers/dashboardController");

module.exports = (deps) => {
  const ctrl = buildController(deps);
  const router = express.Router();

  router.get("/", ctrl.index);
  router.get("/stats", (req, res) => res.redirect(301, "/"));

  return router;
};
