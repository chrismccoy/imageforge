/**
 * Share routes
 */

"use strict";

const express = require("express");
const buildController = require("../controllers/shareController");
const { publicGate, publicLimiter } = require("../middleware/publicRoute");
const { noIndex } = require("../middleware/noIndex");
const { imageExtension } = require("../middleware/imageExt");
const { SHARE_PREFIX, IMAGE_PREFIX } = require("../config/urls");

module.exports = (deps) => {
  const ctrl = buildController(deps);
  const router = express.Router();

  const guard = publicGate(deps, "sharing");
  const limiter = publicLimiter(deps.limits.rate.share);

  router.get(`${SHARE_PREFIX}/:token`, guard, noIndex, limiter, ctrl.view);
  router.get(
    `${IMAGE_PREFIX}/:token`,
    guard,
    noIndex,
    limiter,
    imageExtension("token"),
    ctrl.image
  );

  return router;
};
