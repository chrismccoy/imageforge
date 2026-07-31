/**
 * Collection share controller
 */

"use strict";

const { uploadsDirFor } = require("../utils/files/uploads");
const { toTrimmedString, parseId } = require("../utils/domain/coerce");
const { buildTokenGatedImages } = require("./support/builders/tokenGatedImages");
const { buildTokenGatedList } = require("./support/builders/tokenGatedList");
const { tokenImagePath } = require("../utils/domain/shareUrl");
const { linkCard } = require("../utils/http/linkCard");
const { COLLECTION_PREFIX } = require("../config/urls");
const { requireDeps } = require("./support/helpers/requireDeps");

/**
 * Build the collection share controller.
 */
module.exports = (deps) => {
  const {
    models,
    folders = {},
    log = console,
  } = requireDeps(deps, ["models"], "collectionShareController");
  const { Collection, Generation, ModelPrice } = models;
  const uploadDir = uploadsDirFor(folders);

  /**
   * The collection a token names, or null.
   */
  function findOwner(req) {
    const row = Collection.byToken(toTrimmedString(req.params.token));
    if (!row) return null;

    return { id: row.id, token: row.share_token, title: row.public_title };
  }

  /**
   * The collection and image for a route carrying both, or null.
   */
  function findImage(req) {
    const owner = findOwner(req);
    if (!owner) return null;

    const id = parseId(req.params.id);
    if (!id || !Collection.holds(owner.id, id)) return null;

    const row = Generation.get(id);
    return row ? { row, token: owner.token, owner } : null;
  }

  const images = buildTokenGatedImages({
    prefix: COLLECTION_PREFIX,
    view: "collection-share-image",
    findImage,
    uploadDir,
    ModelPrice,
    extraLocals: (found, req) => ({
      title: found.owner.title,
      publicTitle: found.owner.title,
      card: linkCard(req, {
        title: found.row.prompt || found.owner.title,
        imagePath: tokenImagePath(COLLECTION_PREFIX, found.token, found.row),
      }),
      neighbours: Collection.neighboursIn(found.owner.id, found.row.id),
    }),
  });

  const list = buildTokenGatedList({
    prefix: COLLECTION_PREFIX,
    view: "collection-share",
    findOwner,
    count: (owner) => Collection.countImages(owner.id),
    pageOf: (owner, paging) => Collection.imagesPage(owner.id, paging),
    allOf: (owner) => Collection.allImagesIn(owner.id),
    zipName: "images",
    extraLocals: (owner) => ({ publicTitle: owner.title }),
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
