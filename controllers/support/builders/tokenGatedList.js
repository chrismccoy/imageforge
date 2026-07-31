/**
 * Token-gated lists
 */

"use strict";

const { shareNotFound } = require("../../../utils/http/pages");
const { readPaging } = require("../../../utils/http/pageRequest");
const { pageLink } = require("../../../utils/http/pageLink");
const { presentFiles, sendZip } = require("../../../utils/files/zip");
const { linkCard } = require("../../../utils/http/linkCard");
const { tokenTiles } = require("../../../utils/domain/shareUrl");
const { isoDate } = require("../../../utils/domain/format");

/**
 * Build the list handlers for one public link
 */
function buildTokenGatedList({
  prefix,
  view,
  findOwner,
  count,
  pageOf,
  allOf,
  zipName,
  extraLocals,
  uploadDir,
  log = console,
}) {
  return {
    /**
     * One page of the images behind the link.
     */
    view(req, res) {
      const owner = findOwner(req);
      if (!owner) return shareNotFound(res);

      const total = count(owner);
      const { page, totalPages, offset, pageSize } = readPaging(
        req,
        req.settings,
        total
      );

      const base = `${prefix}/${owner.token}`;

      const tiles = tokenTiles(
        prefix,
        owner.token,
        pageOf(owner, { limit: pageSize, offset })
      );

      res.render(
        view,
        Object.assign(
          {
            title: owner.title,
            noindex: true,
            token: owner.token,
            prefix,
            tiles,
            total,
            page,
            totalPages,
            card: linkCard(req, {
              title: owner.title,
              imagePath: tiles.length ? tiles[0].src : "",
            }),
            prevUrl: pageLink(base, page - 1, {}),
            nextUrl: pageLink(base, page + 1, {}),
          },
          extraLocals ? extraLocals(owner, req) : {}
        )
      );
    },

    /**
     * Everything behind the link, as one zip.
     */
    async downloadAll(req, res) {
      const owner = findOwner(req);
      if (!owner) return shareNotFound(res);

      const files = await presentFiles(allOf(owner), uploadDir);
      if (!files.length) return shareNotFound(res);

      await sendZip(res, files, `${zipName}-${isoDate()}.zip`, { log });
    },
  };
}

module.exports = { buildTokenGatedList };
