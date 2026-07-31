/**
 * API routes
 */

"use strict";

const express = require("express");
const multer = require("multer");
const buildSave = require("../controllers/generationsSaveController");
const buildFlatten = require("../controllers/flattenController");
const { rateLimit } = require("../middleware/rateLimit");
const { parseOrRefuse } = require("../middleware/multipart");
const { costOfGenerate } = require("./apiCost");

module.exports = (deps) => {
  const generate = deps.generateController;
  const edit = deps.editController;
  const crop = deps.cropController;
  const save = buildSave(deps);
  const flatten = buildFlatten(deps);
  const router = express.Router();

  const { rate, editMaxBytes } = deps.limits;

  const generateLimiter = rateLimit({
    ...rate.generate,
    cost: costOfGenerate,
    message: "Too many generations too quickly. Try again in a moment.",
  });

  const saveLimiter = rateLimit({
    ...rate.save,
    message: "Too many saves too quickly. Try again in a moment.",
  });

  const editUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: editMaxBytes, files: 2 },
  }).fields([
    { name: "image", maxCount: 1 },
    { name: "mask", maxCount: 1 },
  ]);

  const parseEdit = parseOrRefuse(editUpload, {
    maxBytes: editMaxBytes,
    tooLarge: "That image is too large to edit.",
    unreadable: "Could not read the uploaded image.",
  });

  const cropUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: editMaxBytes, files: 1 },
  }).fields([{ name: "image", maxCount: 1 }]);

  const parseCrop = parseOrRefuse(cropUpload, {
    maxBytes: editMaxBytes,
    tooLarge: "That crop is too large to save.",
    unreadable: "Could not read the cropped image.",
  });

  router.post("/generate", generateLimiter, generate.generate);
  router.post("/edit", generateLimiter, parseEdit, edit.edit);
  router.post("/crop", saveLimiter, parseCrop, crop.crop);
  router.post("/flatten", saveLimiter, parseCrop, flatten.flatten);
  router.post("/save", saveLimiter, save.save);

  return router;
};
