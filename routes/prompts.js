/**
 * Prompts routes
 */

"use strict";

const express = require("express");
const multer = require("multer");
const buildController = require("../controllers/promptsController");
const buildTransfer = require("../controllers/promptTransferController");
const { parseAndRecord } = require("../middleware/multipart");

module.exports = (deps) => {
  const ctrl = buildController(deps);
  const transfer = buildTransfer(deps);
  const router = express.Router();
  const { importMaxBytes } = deps.limits;

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: importMaxBytes, files: 1 },
  });

  const parseUpload = parseAndRecord(upload.single("file"), {
    maxBytes: importMaxBytes,
    tooLarge: (limit) => `That file is larger than ${limit}.`,
    unreadable: "Could not read the uploaded file.",
  });

  router.get("/prompts", ctrl.index);
  router.get("/prompts/page/:page", ctrl.index);
  router.get("/prompts/export", transfer.exportAll);
  router.get("/prompts/backup", transfer.index);
  router.get("/prompts/new", ctrl.newForm);
  router.post("/prompts", ctrl.create);
  router.post("/prompts/import", parseUpload, transfer.importFile);
  router.post("/prompts/bulk-delete", ctrl.bulkDelete);
  router.get("/prompts/:id/edit", ctrl.editForm);
  router.get("/prompts/:id/duplicate", ctrl.duplicateForm);
  router.post("/prompts/:id/rating/:value", ctrl.rate);
  router.post("/prompts/:id/pin", ctrl.pin);
  router.post("/prompts/:id", ctrl.update);
  router.post("/prompts/:id/delete", ctrl.remove);

  return router;
};
