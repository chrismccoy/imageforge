/**
 * Flatten controller
 */

"use strict";

const { problem } = require("../utils/http/http");
const { field } = require("../utils/http/request");
const { sniffImageType } = require("../utils/files/imageType");
const { requireDeps } = require("./support/helpers/requireDeps");

/**
 * Build the flatten controller
 */
module.exports = (deps) => {
  const { pending } = requireDeps(deps, ["pending"], "flattenController");
  return {
    /**
     * Put flattened bytes in place of the ones being held.
     */
    flatten(req, res) {
      if (req.uploadError) {
        return problem(res, 400, req.uploadError);
      }

      const token = field(req.body, "token");
      const file = req.files && req.files.image && req.files.image[0];

      if (!file || !file.buffer || !file.buffer.length) {
        return problem(res, 400, "There is nothing to flatten.");
      }

      if (!sniffImageType(file.buffer)) {
        return problem(res, 400, "That is not an image.");
      }

      if (!pending.replace(token, file.buffer)) {
        return problem(res, 400, "That image is no longer being held.");
      }

      res.json({ flattened: true });
    },
  };
};
