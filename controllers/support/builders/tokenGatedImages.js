/**
 * Token-gated images
 */

"use strict";

const { PUBLIC_IMAGE_CACHE } = require("../../../config/limits");
const { shareNotFound } = require("../../../utils/http/pages");
const { uploadPath } = require("../../../utils/files/uploads");
const { formatTokens } = require("../../../utils/domain/usage");
const { costOf, formatCost } = require("../../../utils/domain/cost");
const { extensionOf, extMatches } = require("../../../utils/domain/imageExt");

/**
 * Build the image handlers for one public link
 */
function buildTokenGatedImages({
  prefix,
  view,
  findImage,
  extraLocals,
  uploadDir,
  ModelPrice,
}) {
  const claimed = (req) => req.imageExt || "";

  /**
   * The same request, said the way this app now says it.
   */
  function canonicalPath(req, ext) {
    const [path] = String(req.originalUrl || "").split("?");
    const base = path.endsWith("/file") ? path.slice(0, -"/file".length) : path;

    return `${base}.${ext}`;
  }

  const handlers = {
    /**
     * One image's own page, or its bytes when the URL named a format.
     */
    image(req, res) {
      if (claimed(req)) return handlers.file(req, res);

      const found = findImage(req);
      if (!found) return shareNotFound(res);

      res.render(
        view,
        Object.assign(
          {
            noindex: true,
            prefix,
            token: found.token,
            id: found.row.id,
            prompt: found.row.prompt,
            model: found.row.model,
            size: found.row.size,
            tokens: formatTokens(found.row.usage_total_tokens),
            ext: extensionOf(found.row.filename),
            cost: formatCost(costOf(found.row, ModelPrice.all()[found.row.model])),
            createdAt: found.row.created_at,
          },
          extraLocals ? extraLocals(found, req) : {}
        )
      );
    },

    /**
     * The bytes of one image.
     */
    file(req, res) {
      const found = findImage(req);
      if (!found || !extMatches(found.row.filename, claimed(req))) {
        return shareNotFound(res);
      }

      const own = extensionOf(found.row.filename);
      if (!claimed(req) && own) {
        return res.redirect(301, canonicalPath(req, own));
      }

      const { full } = uploadPath(found.row.filename, uploadDir);
      res.sendFile(full, { headers: PUBLIC_IMAGE_CACHE }, (err) => {
        if (err && !res.headersSent) shareNotFound(res);
      });
    },

    /**
     * One image as a file download.
     */
    download(req, res) {
      const found = findImage(req);
      if (!found) return shareNotFound(res);

      const { safe, full } = uploadPath(found.row.filename, uploadDir);
      res.download(full, safe, (err) => {
        if (err && !res.headersSent) shareNotFound(res);
      });
    },
  };

  return handlers;
}

module.exports = { buildTokenGatedImages };
