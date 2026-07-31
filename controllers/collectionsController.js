/**
 * Collections controller
 */

"use strict";

const { field } = require("../utils/http/request");
const { parseId } = require("../utils/domain/coerce");
const { PAGES, COLLECTION_PREFIX } = require("../config/urls");
const { newShareToken } = require("../utils/domain/shareToken");
const { buildNamedListController } = require("./support/builders/namedList");
const { requireDeps } = require("./support/helpers/requireDeps");

const TAKEN = "That name is already used by another collection.";
const NEEDS_TITLE =
  "Give the shared page a title. The collection's own name is never shown.";

/**
 * Build the collections controller
 */
module.exports = (deps) => {
  const { models } = requireDeps(deps, ["models"], "collectionsController");
  const { Collection } = models;

  const list = buildNamedListController({
    list: Collection,
    view: "collections",
    path: PAGES.collections,
    title: "Collections",
    active: "collections",
    taken: TAKEN,
    locals: () => ({
      collections: Collection.all(),
      collectionPrefix: COLLECTION_PREFIX,
    }),
  });

  return Object.assign({}, list, {
    /**
     * Share a collection on a public link.
     */
    share(req, res) {
      const id = parseId(req.params.id);
      if (!id || !Collection.get(id)) return res.redirect(PAGES.collections);

      if (!Collection.share(id, field(req.body, "title"), newShareToken)) {
        return list.renderList(res, { error: NEEDS_TITLE, status: 400 });
      }
      res.redirect(PAGES.collections);
    },

    /**
     * Revoke the link. Every URL under it dies at once.
     */
    unshare(req, res) {
      const id = parseId(req.params.id);
      if (id) Collection.unshare(id);
      res.redirect(PAGES.collections);
    },
  });
};
