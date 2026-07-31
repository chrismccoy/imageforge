/**
 * Generation collections controller
 */

"use strict";

const { field, idList } = require("../utils/http/request");
const { parseId } = require("../utils/domain/coerce");
const { PAGES } = require("../config/urls");
const { problem } = require("../utils/http/http");
const { requireDeps } = require("./support/helpers/requireDeps");

/**
 * Build the generation collections controller.
 */
module.exports = (deps) => {
  const { models } = requireDeps(
    deps,
    ["models"],
    "generationCollectionsController"
  );
  const { Generation, Collection } = models;

  /**
   * A handler that changes one image's membership of one collection.
   */
  function membership(change) {
    return function (req, res) {
      const id = parseId(req.params.id);
      const collectionId = parseId(req.params.collectionId);

      if (!id || !Generation.get(id)) {
        return problem(res, 404, "That image is not saved.");
      }
      if (!collectionId || !Collection.get(collectionId)) {
        return problem(res, 404, "That collection is gone.");
      }

      change(id, collectionId);
      res.json({ collections: Collection.ofImage(id) });
    };
  }

  return {
    /**
     * File every checked image under one collection.
     */
    bulkCollect(req, res) {
      const ids = idList(req.body, "ids");
      const collectionId = parseId(field(req.body, "collectionId"));

      if (ids.length && collectionId && Collection.get(collectionId)) {
        Collection.addImages(ids, collectionId);
      }
      res.redirect(PAGES.generations);
    },

    /**
     * File an image under a collection. Doing it twice changes nothing.
     */
    addToCollection: membership((id, collectionId) =>
      Collection.addImage(id, collectionId)
    ),

    /**
     * Take an image out of a collection. Removing what is not there is fine.
     */
    removeFromCollection: membership((id, collectionId) =>
      Collection.removeImage(id, collectionId)
    ),
  };
};
