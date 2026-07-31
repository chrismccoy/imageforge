/**
 * Public favourites routes
 *
 * The pages behind the favourites link. These never require a login.
 */

"use strict";

const express = require("express");
const buildController = require("../controllers/favouritesShareController");
const { publicGate, shareLimiters } = require("../middleware/publicRoute");
const { noIndex } = require("../middleware/noIndex");
const { imageExtension } = require("../middleware/imageExt");
const { FAVOURITES_PREFIX } = require("../config/urls");

module.exports = (deps) => {
  const ctrl = buildController(deps);
  const router = express.Router();

  const guard = publicGate(deps, "favourites");
  const { limiter, zipLimiter } = shareLimiters(deps.limits.rate);

  const on = (path, handler) =>
    router.get(`${FAVOURITES_PREFIX}${path}`, guard, noIndex, limiter, handler);

  on("/:token", ctrl.view);
  on("/:token/page/:page", ctrl.view);
  router.get(
    `${FAVOURITES_PREFIX}/:token/download`,
    guard,
    noIndex,
    zipLimiter,
    ctrl.downloadAll
  );
  router.get(
    `${FAVOURITES_PREFIX}/:token/i/:id`,
    guard,
    noIndex,
    limiter,
    imageExtension("id"),
    ctrl.image
  );
  on("/:token/i/:id/file", ctrl.file);
  on("/:token/i/:id/download", ctrl.download);

  return router;
};
