/**
 * Generate page route
 */

"use strict";

const express = require("express");

module.exports = (deps) => {
  const ctrl = deps.generateController;
  const router = express.Router();

  router.get("/generate", ctrl.showGenerate);

  return router;
};
