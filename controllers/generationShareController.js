/**
 * Generation share controller
 */

"use strict";

const { parseId } = require("../utils/domain/coerce");
const { PAGES } = require("../config/urls");
const { problem } = require("../utils/http/http");
const { newShareToken } = require("../utils/domain/shareToken");
const { buildShareUrls } = require("../utils/domain/shareUrl");
const { requireDeps } = require("./support/helpers/requireDeps");

/**
 * Build the generation share controller.
 */
module.exports = (deps) => {
  const { models, access } = requireDeps(
    deps,
    ["models", "access"],
    "generationShareController"
  );
  const { Generation } = models;

  return {
    /**
     * Give a saved image a public share link, generating the token on first use.
     */
    share(req, res) {
      const id = parseId(req.params.id);
      const row = id ? Generation.get(id) : null;
      if (!row) {
        return problem(res, 404, "That image is not saved.");
      }

      const token = row.share_token || Generation.share(id, newShareToken);

      res.json(
        buildShareUrls(
          Object.assign({}, row, { share_token: token }),
          access.slug(req.settings)
        )
      );
    },

    /**
     * Take a public share link back. Every copy of the URL stops working.
     */
    unshare(req, res) {
      const id = parseId(req.params.id);
      if (id) Generation.clearShareToken(id);
      res.redirect(PAGES.generations);
    },
  };
};
