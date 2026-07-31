/**
 * Categories routes
 */

"use strict";

const express = require("express");
const buildController = require("../controllers/categoriesController");

module.exports = (deps) => {
  const ctrl = buildController(deps);
  const router = express.Router();

  router.get("/categories", ctrl.index);
  router.post("/categories", ctrl.create);
  router.post("/categories/:id/delete", ctrl.remove);
  router.post("/categories/:id", ctrl.update);

  return router;
};
