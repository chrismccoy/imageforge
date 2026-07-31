/**
 * Share controller
 */

"use strict";

const { uploadsDirFor } = require("../utils/files/uploads");
const { toTrimmedString } = require("../utils/domain/coerce");
const { shareNotFound } = require("../utils/http/pages");
const { buildShareUrls } = require("../utils/domain/shareUrl");
const { linkCard } = require("../utils/http/linkCard");
const { formatTokens } = require("../utils/domain/usage");
const { costOf, formatCost } = require("../utils/domain/cost");
const { buildTokenGatedImages } = require("./support/builders/tokenGatedImages");
const { VIEWS } = require("../config/views");
const { IMAGE_PREFIX, SHARE_PREFIX } = require("../config/urls");
const { requireDeps } = require("./support/helpers/requireDeps");

/**
 * Build the share controller.
 */
module.exports = (deps) => {
  const {
    models,
    access,
    folders = {},
  } = requireDeps(deps, ["models", "access"], "shareController");
  const { Generation, ModelPrice } = models;
  const uploadDir = uploadsDirFor(folders);

  /**
   * The saved image a token points at
   */
  function generationForToken(rawToken) {
    const token = toTrimmedString(rawToken);
    if (!token) return null;

    const exact = Generation.getByShareToken(token);
    if (exact) return exact;

    const lastBreak = token.lastIndexOf("-");
    if (lastBreak === -1) return null;

    return Generation.getByShareToken(token.slice(lastBreak + 1)) || null;
  }

  const images = buildTokenGatedImages({
    prefix: IMAGE_PREFIX,
    uploadDir,
    ModelPrice,
    view: VIEWS.SHARE,
    findImage(req) {
      const row = generationForToken(req.params.token);
      return row ? { row, token: row.share_token } : null;
    },
  });

  return {
    /**
     * Send the image bytes a shared token points at.
     */
    image: images.file,

    /**
     * Show the public landing page for a shared image.
     */
    view(req, res) {
      const row = generationForToken(req.params.token);
      if (!row) return shareNotFound(res);

      const imageUrl = buildShareUrls(row, access.slug(req.settings)).image;

      res.render(VIEWS.SHARE, {
        title: "Shared image",
        noindex: true,
        card: linkCard(req, {
          title: row.prompt || "Shared image",
          imagePath: imageUrl,
        }),
        token: row.share_token,
        prefix: SHARE_PREFIX,
        imageUrl,
        prompt: row.prompt,
        model: row.model,
        size: row.size,
        tokens: formatTokens(row.usage_total_tokens),
        cost: formatCost(costOf(row, ModelPrice.all()[row.model])),
        createdAt: row.created_at,
      });
    },
  };
};
