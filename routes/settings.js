/**
 * Settings routes
 */

"use strict";

const express = require("express");
const buildController = require("../controllers/settingsController");

module.exports = (deps) => {
  const ctrl = buildController(deps);
  const router = express.Router();

  router.get("/settings", ctrl.index);
  router.post("/settings", ctrl.update);
  router.post("/settings/favourites/share", ctrl.shareFavourites);
  router.post("/settings/favourites/unshare", ctrl.unshareFavourites);

  return router;
};
