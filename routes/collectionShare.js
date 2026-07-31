/**
 * Shared collection routes
 */

"use strict";

const express = require("express");
const buildController = require("../controllers/collectionShareController");
const { publicGate, shareLimiters } = require("../middleware/publicRoute");
const { noIndex } = require("../middleware/noIndex");
const { imageExtension } = require("../middleware/imageExt");
const { COLLECTION_PREFIX } = require("../config/urls");

module.exports = (deps) => {
  const ctrl = buildController(deps);
  const router = express.Router();

  const guard = publicGate(deps, "collections");
  const { limiter, zipLimiter } = shareLimiters(deps.limits.rate);

  router.get(`${COLLECTION_PREFIX}/:token`, guard, noIndex, limiter, ctrl.view);
  router.get(
    `${COLLECTION_PREFIX}/:token/page/:page`,
    guard,
    noIndex,
    limiter,
    ctrl.view
  );
  router.get(
    `${COLLECTION_PREFIX}/:token/download`,
    guard,
    noIndex,
    zipLimiter,
    ctrl.downloadAll
  );
  router.get(
    `${COLLECTION_PREFIX}/:token/i/:id/download`,
    guard,
    noIndex,
    limiter,
    ctrl.download
  );
  router.get(
    `${COLLECTION_PREFIX}/:token/i/:id`,
    guard,
    noIndex,
    limiter,
    imageExtension("id"),
    ctrl.image
  );
  router.get(
    `${COLLECTION_PREFIX}/:token/i/:id/file`,
    guard,
    noIndex,
    limiter,
    ctrl.file
  );

  return router;
};
