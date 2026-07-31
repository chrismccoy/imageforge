/**
 * Generations routes
 */

"use strict";

const express = require("express");
const buildController = require("../controllers/generationsController");
const buildFiles = require("../controllers/filesController");
const buildCollections = require("../controllers/generationCollectionsController");
const buildShare = require("../controllers/generationShareController");
const { UPLOAD_PREFIX } = require("../config/urls");

module.exports = (deps) => {
  const ctrl = buildController(deps);
  const files = buildFiles(deps);
  const collections = buildCollections(deps);
  const share = buildShare(deps);
  const router = express.Router();

  router.get(`${UPLOAD_PREFIX}/:filename`, files.serveUpload);
  router.get("/generations", ctrl.index);
  router.get("/generations/page/:page", ctrl.index);
  router.get("/generations/download-all", files.downloadAll);
  router.get("/generations/:id/download", files.download);
  router.get("/generations/:id/compare", ctrl.compare);
  router.post("/generations/view", ctrl.setView);
  router.post("/generations/bulk-delete", ctrl.bulkDelete);
  router.post("/generations/bulk-download", files.bulkDownload);
  router.post("/generations/bulk-collect", collections.bulkCollect);
  router.post("/generations/:id/delete", ctrl.remove);
  router.post("/generations/:id/favorite", ctrl.favorite);
  router.post(
    "/generations/:id/collections/:collectionId/remove",
    collections.removeFromCollection
  );
  router.post(
    "/generations/:id/collections/:collectionId",
    collections.addToCollection
  );
  router.post("/generations/:id/share", share.share);
  router.post("/generations/:id/unshare", share.unshare);

  return router;
};
