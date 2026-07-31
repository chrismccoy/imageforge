/**
 * Crop controller
 */

"use strict";

const { ALLOWED_SIZES } = require("../config/images");
const { aspectsFrom } = require("../utils/domain/aspect");
const { field } = require("../utils/http/request");
const { parseId } = require("../utils/domain/coerce");
const { problem } = require("../utils/http/http");
const { sniffImageType } = require("../utils/files/imageType");
const { notFound } = require("../utils/http/pages");
const { requireDeps } = require("./support/helpers/requireDeps");

/**
 * Build the crop controller
 */
module.exports = (deps) => {
  const { models, pending } = requireDeps(
    deps,
    ["models", "pending"],
    "cropController"
  );
  const { Generation } = models;

  function liveImage(id) {
    const parsed = parseId(id);
    return parsed ? Generation.get(parsed) || null : null;
  }

  return {
    /**
     * Show the crop page for one image.
     */
    show(req, res) {
      const row = liveImage(field(req.params, "id"));
      if (!row) return notFound(res);

      res.render("crop", {
        title: "Crop Image",
        active: "generations",
        image: row,
        aspects: aspectsFrom(ALLOWED_SIZES),
      });
    },

    /**
     * Take the cropped bytes and hold them for saving.
     */
    crop(req, res) {
      if (req.uploadError) {
        return problem(res, 400, req.uploadError);
      }

      const source = liveImage(field(req.body, "source_id"));
      if (!source) {
        return problem(res, 404, "That image is not saved.");
      }

      const file = req.files && req.files.image && req.files.image[0];
      if (!file || !file.buffer || !file.buffer.length) {
        return problem(res, 400, "There is nothing to crop.");
      }

      if (!sniffImageType(file.buffer)) {
        return problem(res, 400, "That is not an image.");
      }

      const token = pending.put(file.buffer, {
        prompt: source.prompt,
        prompt_id: source.prompt_id || null,
        model: source.model,
        size: field(req.body, "size") || source.size,
        usage: null,
        edited_from: source.id,
      });

      res.json({
        token,
        url: `data:image/png;base64,${file.buffer.toString("base64")}`,
      });
    },
  };
};
