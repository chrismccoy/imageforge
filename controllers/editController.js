/**
 * Edit controller
 */

"use strict";

const {
  ALLOWED_SIZES,
  normalizeSize,
  normalizeModel,
  pickerModel,
  MODEL_TOKENS,
  MODELS,
} = require("../config/images");
const { sizeFrom, field } = require("../utils/http/request");
const { parseId } = require("../utils/domain/coerce");
const { problem } = require("../utils/http/http");
const { editImage } = require("../services/openai");
const { pngSize } = require("../utils/files/png");
const { sniffImageType } = require("../utils/files/imageType");
const { notFound } = require("../utils/http/pages");
const { requireDeps } = require("./support/helpers/requireDeps");

/**
 * Build the edit controller
 */
module.exports = (deps) => {
  const {
    models,
    openaiCredentials,
    pending,
    log = console,
  } = requireDeps(
    deps,
    ["models", "openaiCredentials", "pending"],
    "editController"
  );
  const { Generation, Spend } = models;

  /**
   * The live image an id names, or null. Generation.get reads the
   * live_generations view, so a trashed image is already not found.
   */
  function findImage(req) {
    const id = parseId(field(req.params, "id"));
    return id ? Generation.get(id) || null : null;
  }

  return {
    /**
     * Show the edit page for one image.
     */
    show(req, res) {
      const row = findImage(req);
      if (!row) return notFound(res);

      const settings = req.settings;

      res.render("edit", {
        title: "Edit Image",
        active: "generations",
        image: row,
        sizes: ALLOWED_SIZES,
        defaultSize: normalizeSize(row.size, settings.default_size),
        modelTokens: MODEL_TOKENS,
        modelIds: MODELS,
        selectedModel: pickerModel(row.model, openaiCredentials.model()),
        startingPrompt: row.prompt || "",
        hasKey: Boolean(openaiCredentials.apiKey()),
      });
    },

    /**
     * Make the edit and hold the result for saving.
     */
    async edit(req, res) {
      const id = parseId(field(req.body, "source_id"));
      const row = id ? Generation.get(id) : null;
      if (!row) {
        return problem(res, 404, "That image is not saved.");
      }

      const prompt = field(req.body, "prompt");
      if (!prompt) {
        return problem(res, 400, "The prompt is empty.");
      }

      const files = req.files || {};
      const image = files.image && files.image[0];
      const mask = files.mask && files.mask[0];
      if (!image || !mask) {
        return problem(res, 400, "An edit needs both the image and the mask.");
      }

      for (const [what, file] of [
        ["image", image],
        ["mask", mask],
      ]) {
        const kind = sniffImageType(file.buffer);
        if (!kind || kind.ext !== "png") {
          return problem(res, 400, `The ${what} has to be a PNG.`);
        }
      }

      const imageSize = pngSize(image.buffer);
      const maskSize = pngSize(mask.buffer);
      if (
        !imageSize ||
        !maskSize ||
        imageSize.width !== maskSize.width ||
        imageSize.height !== maskSize.height
      ) {
        return problem(res, 400, "The mask has to be the same size as the image.");
      }

      const size = sizeFrom(req.body, req.settings.default_size);
      const model = normalizeModel(
        field(req.body, "model"),
        openaiCredentials.model()
      );

      try {
        const result = await editImage({
          prompt,
          size,
          apiKey: openaiCredentials.apiKey(),
          model,
          imageBytes: image.buffer,
          maskBytes: mask.buffer,
          imageName: row.filename,
          log,
        });

        Spend.recordGenerated({
          model: result.model,
          usage: result.usage,
          images: 1,
        });

        const token = pending.put(result.bytes, {
          prompt,
          size,
          model: result.model,
          usage: result.usage,
          edited_from: row.id,
          prompt_id: row.prompt_id || null,
        });

        res.json({ token, url: result.dataUrl });
      } catch (err) {
        problem(res, 400, err.message || "Something went wrong.");
      }
    },
  };
};
