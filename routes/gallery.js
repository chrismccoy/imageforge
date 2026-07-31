/**
 * Gallery routes
 *
 * Public when PUBLIC_GALLERY is on, and behind the login when it is off.
 */

"use strict";

const express = require("express");
const buildController = require("../controllers/galleryController");
const { publicGate, publicLimiter } = require("../middleware/publicRoute");
const { noIndex } = require("../middleware/noIndex");
const { requireAuth } = require("../middleware/auth");

module.exports = (deps) => {
  const ctrl = buildController(deps);
  const router = express.Router();

  const guard = publicGate(deps, "gallery", { orAuth: requireAuth });
  const limiter = publicLimiter(deps.limits.rate.share);

  router.get("/gallery", guard, noIndex, limiter, ctrl.index);
  router.get("/gallery/page/:page", guard, noIndex, limiter, ctrl.index);

  return router;
};
