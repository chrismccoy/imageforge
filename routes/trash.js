/**
 * Trash routes
 */

"use strict";

const express = require("express");
const buildController = require("../controllers/trashController");

module.exports = (deps) => {
  const ctrl = buildController(deps);
  const router = express.Router();

  router.get("/trash", ctrl.index);
  router.post("/trash/empty", ctrl.empty);
  router.post("/trash/:id/restore", ctrl.restore);
  router.post("/trash/:id/purge", ctrl.purge);

  return router;
};
