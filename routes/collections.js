/**
 * Collections routes
 */

"use strict";

const express = require("express");
const buildController = require("../controllers/collectionsController");

module.exports = (deps) => {
  const ctrl = buildController(deps);
  const router = express.Router();

  router.get("/collections", ctrl.index);
  router.post("/collections", ctrl.create);
  router.post("/collections/:id/delete", ctrl.remove);
  router.post("/collections/:id/share", ctrl.share);
  router.post("/collections/:id/unshare", ctrl.unshare);
  router.post("/collections/:id", ctrl.update);

  return router;
};
