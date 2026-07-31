/**
 * Edit page route
 */

"use strict";

const express = require("express");

module.exports = (deps) => {
  const ctrl = deps.editController;
  const router = express.Router();

  router.get("/edit/:id", ctrl.show);

  return router;
};
