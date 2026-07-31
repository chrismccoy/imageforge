/**
 * Upload controller
 */

"use strict";

const {
  ALLOWED_SIZES,
  DEFAULT_SIZE,
  MODEL_TOKENS,
  MODELS,
  normalizeModel,
} = require("../config/images");
const { PAGES } = require("../config/urls");

const { INSUFFICIENT_STORAGE } = require("../utils/http/http");
const { sizeFrom, field } = require("../utils/http/request");
const { parseId } = require("../utils/domain/coerce");
const { ACCEPTED_MIME } = require("../utils/files/imageType");
const { uploadsDirFor } = require("../utils/files/uploads");
const { requireUsage } = require("../services/uploadsUsage");
const { readableBytes } = require("../utils/domain/format");
const { requireDeps } = require("./support/helpers/requireDeps");
const { saveBatch, summarise } = require("./support/helpers/uploadBatch");

/**
 * Build the upload controller.
 */
module.exports = (deps) => {
  const {
    models,
    limits,
    folders = {},
    log = console,
    usage,
  } = requireDeps(deps, ["models", "limits"], "uploadController");
  const { Generation, Prompt, Settings } = models;
  const uploadDir = uploadsDirFor(folders);
  const room = requireUsage(usage, "uploadController");

  /**
   * Render the upload form, keeping any entered values and an optional error.
   */
  function renderForm(
    res,
    { error = null, status = 200, body = {}, results = [] } = {}
  ) {
    return res.status(status).render("upload", {
      title: "Upload Image",
      active: "upload",
      prompts: Prompt.all(),
      sizes: ALLOWED_SIZES,
      selectedPromptId: body.prompt_id ? String(body.prompt_id) : "",
      promptText: body.prompt || "",
      selectedSize: body.size || DEFAULT_SIZE,
      models: MODEL_TOKENS,
      modelIds: MODELS,
      selectedModel: normalizeModel(body.model, Settings.get().model),
      maxBytes: limits.uploadMaxBytes,
      maxLabel: readableBytes(limits.uploadMaxBytes),
      acceptedMime: ACCEPTED_MIME,
      maxFiles: limits.uploadMaxFiles,
      results,
      error,
    });
  }

  return {
    /**
     * Show the empty upload form.
     */
    showForm(req, res) {
      return renderForm(res, {});
    },

    /**
     * Save the uploaded images.
     */
    async create(req, res) {
      if (req.uploadError) {
        return renderForm(res, {
          error: req.uploadError,
          status: 400,
          body: req.body,
        });
      }

      const files = (req.files || []).filter(
        (file) => file && file.buffer && file.buffer.length
      );

      if (!files.length) {
        return renderForm(res, {
          error: "Choose an image to upload.",
          status: 400,
          body: req.body,
        });
      }

      const size = sizeFrom(req.body, DEFAULT_SIZE);

      const model =
        MODELS[normalizeModel(field(req.body, "model"), Settings.get().model)];

      const promptId = parseId(req.body.prompt_id);
      const chosen = promptId ? Prompt.get(promptId) : null;
      const prompt = chosen ? chosen.prompt : field(req.body, "prompt");
      const prompt_id = chosen ? chosen.id : null;

      const results = await saveBatch(files, {
        room,
        uploadDir,
        record: (row) => Generation.add(row),
        details: { prompt, prompt_id, model, size },
        log,
      });

      const batch = summarise(results);

      if (batch.all) return res.redirect(PAGES.generations);

      return renderForm(res, {
        error: batch.error,
        status: batch.saved ? 200 : batch.outOfRoom ? INSUFFICIENT_STORAGE : 400,
        body: req.body,
        results,
      });
    },
  };
};
