/**
 * Favourites share controller
 */

"use strict";

const { uploadsDirFor } = require("../utils/files/uploads");
const { toTrimmedString, parseId } = require("../utils/domain/coerce");
const { buildTokenGatedImages } = require("./support/builders/tokenGatedImages");
const { buildTokenGatedList } = require("./support/builders/tokenGatedList");
const { tokenImagePath } = require("../utils/domain/shareUrl");
const { linkCard } = require("../utils/http/linkCard");
const { FAVOURITES_PREFIX } = require("../config/urls");
const { requireDeps } = require("./support/helpers/requireDeps");

const TITLE = "Favourites";

/**
 * Build the favourites share controller
 */
module.exports = (deps) => {
  const {
    models,
    folders = {},
    log = console,
  } = requireDeps(deps, ["models"], "favouritesShareController");
  const { Generation, Settings, ModelPrice } = models;
  const uploadDir = uploadsDirFor(folders);

  /**
   * The favourites set, when the request carries the live token.
   */
  function findOwner(req) {
    const token = toTrimmedString(req.params.token);
    if (!Settings.favouritesTokenIs(token)) return null;

    return { token, title: TITLE };
  }

  /**
   * The starred image this request may reach, or null.
   */
  function findImage(req) {
    const owner = findOwner(req);
    if (!owner) return null;

    const id = parseId(req.params.id);
    if (!id) return null;

    const row = Generation.get(id);
    if (!row || row.favorite !== 1) return null;

    return { row, token: owner.token, owner };
  }

  const images = buildTokenGatedImages({
    prefix: FAVOURITES_PREFIX,
    view: "favourites-share-image",
    findImage,
    uploadDir,
    ModelPrice,
    extraLocals: (found, req) => ({
      title: TITLE,
      card: linkCard(req, {
        title: found.row.prompt || TITLE,
        imagePath: tokenImagePath(FAVOURITES_PREFIX, found.token, found.row),
      }),
      neighbours: Generation.favouriteNeighbours(found.row.id),
    }),
  });

  const list = buildTokenGatedList({
    prefix: FAVOURITES_PREFIX,
    view: "favourites-share",
    findOwner,
    count: () => Generation.count({ favorite: true }),
    pageOf: (owner, paging) => Generation.page({ favorite: true, ...paging }),
    allOf: () => Generation.allFavourites(),
    zipName: "favourites",
    uploadDir,
    log,
  });

  return {
    image: images.image,
    file: images.file,
    download: images.download,
    view: list.view,
    downloadAll: list.downloadAll,
  };
};
