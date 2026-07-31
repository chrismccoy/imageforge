/**
 * Crop page route
 */

"use strict";

const express = require("express");

module.exports = (deps) => {
  const ctrl = deps.cropController;
  const router = express.Router();

  router.get("/crop/:id", ctrl.show);

  return router;
};
