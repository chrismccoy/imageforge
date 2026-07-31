/**
 * Generations save controller
 */

"use strict";

const fsp = require("fs/promises");

const { UPLOAD_PREFIX } = require("../config/urls");
const { problem, INSUFFICIENT_STORAGE } = require("../utils/http/http");
const { field } = require("../utils/http/request");
const { parseId } = require("../utils/domain/coerce");
const { generatedImageName } = require("../utils/domain/filename");
const { uploadPath, uploadsDirFor } = require("../utils/files/uploads");
const { requireUsage } = require("../services/uploadsUsage");
const { requireDeps } = require("./support/helpers/requireDeps");

/**
 * Build the save controller.
 */
module.exports = (deps) => {
  const {
    models,
    pending,
    folders = {},
    log = console,
    usage,
  } = requireDeps(deps, ["models", "pending"], "generationsSaveController");
  const { Generation } = models;
  const uploadDir = uploadsDirFor(folders);
  const room = requireUsage(usage, "generationsSaveController");

  return {
    /**
     * Save a previously generated image to disk and record it.
     */
    async save(req, res) {
      const token = field(req.body, "token");
      const claimed = pending.claim(token);
      if (!claimed) {
        return problem(res, 400, "Nothing to save. Generate an image first.");
      }

      const prompt_id = parseId(req.body.prompt_id);
      const filename = generatedImageName();
      const { full } = uploadPath(filename, uploadDir);

      try {
        const saved = await room.write(claimed.bytes.length, () =>
          fsp.writeFile(full, claimed.bytes)
        );

        if (!saved) {
          pending.restore(token, claimed);

          const waiting = Generation.trashed().length;
          const extra = waiting
            ? ` The trash is holding ${waiting} image${waiting === 1 ? "" : "s"} — empty it to free room.`
            : "";

          return problem(
            res,
            INSUFFICIENT_STORAGE,
            `Storage is full. Delete some saved images and try again.${extra}`
          );
        }
      } catch (err) {
        pending.restore(token, claimed);
        log.error("Could not save image:", err.message);
        return problem(res, 500, "The image could not be saved.");
      }

      try {
        Generation.add({
          filename,
          prompt: claimed.meta.prompt,
          prompt_id: prompt_id ?? claimed.meta.prompt_id ?? null,
          model: claimed.meta.model,
          size: claimed.meta.size,
          usage: claimed.meta.usage,
          edited_from: claimed.meta.edited_from ?? null,
          spend_counted: 1,
        });

        res.json({ url: `${UPLOAD_PREFIX}/${filename}` });
      } catch (err) {
        log.error("Could not record the saved image:", err.message);
        return problem(res, 500, "The image could not be saved.");
      }
    },
  };
};
