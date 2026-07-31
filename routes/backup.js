/**
 * Backup routes
 */

"use strict";

const express = require("express");
const buildController = require("../controllers/backupController");

module.exports = (deps) => {
  const ctrl = buildController(deps);
  const router = express.Router();

  router.post("/backups", ctrl.create);
  router.post("/backups/:name/delete", ctrl.remove);
  router.get("/backups/:name", ctrl.download);

  return router;
};
