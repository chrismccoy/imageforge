/**
 * Upload route
 */

"use strict";

const express = require("express");
const multer = require("multer");
const buildController = require("../controllers/uploadController");
const { parseAndRecord } = require("../middleware/multipart");

module.exports = (deps) => {
  const ctrl = buildController(deps);
  const router = express.Router();
  const { uploadMaxBytes, uploadMaxFiles } = deps.limits;

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: uploadMaxBytes, files: uploadMaxFiles },
  });

  const parseUpload = parseAndRecord(upload.array("image", uploadMaxFiles), {
    maxBytes: uploadMaxBytes,
    maxFiles: uploadMaxFiles,
    tooLarge: (limit) => `One of those images is larger than ${limit}.`,
    tooMany: (limit) =>
      `That is more than ${limit} images. Send them in smaller batches.`,
    unreadable: "Could not read the uploaded files.",
  });

  router.get("/upload", ctrl.showForm);
  router.post("/upload", parseUpload, ctrl.create);

  return router;
};
