/**
 * Generations controller
 */

"use strict";

const { field, idRows } = require("../utils/http/request");
const { parseId } = require("../utils/domain/coerce");
const { PAGES } = require("../config/urls");
const { readPaging } = require("../utils/http/pageRequest");
const { confirmed, renderConfirm } = require("../utils/http/confirm");
const { problem } = require("../utils/http/http");
const { notFound } = require("../utils/http/pages");
const { buildShareUrls } = require("../utils/domain/shareUrl");
const { formatTokens } = require("../utils/domain/usage");
const { costOf, formatCost } = require("../utils/domain/cost");
const { pageLink } = require("../utils/http/pageLink");
const { requireDeps } = require("./support/helpers/requireDeps");
const {
  LAYOUTS,
  readCriteria,
  layout,
  carriedFrom,
  carriedValues,
  listLinks,
} = require("./support/helpers/generationCriteria");
const { emptyHeadline, emptyNote } = require("./support/helpers/emptyWording");

/**
 * Build the generations controller
 */
module.exports = (deps) => {
  const { models, access } = requireDeps(
    deps,
    ["models", "access"],
    "generationsController"
  );
  const { Generation, ModelPrice, Collection, Prompt, Settings, ops } = models;

  /**
   * Everything the list template needs, for one set of filters and one page.
   */
  function listView(criteria, paging) {
    const { q, search, favorite, fav, collection, promptFilter } = criteria;
    const { page, totalPages, pageSize, offset, total, settings } = paging;

    const promptRow = promptFilter ? Prompt.get(parseId(promptFilter)) : null;
    const useSlug = access.slug(settings);
    const priceList = ModelPrice.all();

    const rows = Generation.page({
      search,
      favorite,
      collectionId: collection,
      promptId: promptFilter,
      limit: pageSize,
      offset,
    });
    const chips = Collection.forImages(rows.map((row) => row.id));

    return {
      title: favorite ? "Favourites" : "Saved Generations",
      active: favorite ? "favourites" : "generations",
      sharing: access.sharing(settings),
      ...layout(criteria),
      filters: carriedValues(criteria),

      generations: rows.map((row) => {
        const urls = buildShareUrls(row, useSlug);
        return Object.assign({}, row, {
          share_link: urls.link,
          share_image: urls.image,
          tokens: formatTokens(row.usage_total_tokens),
          cost: formatCost(costOf(row, priceList[row.model])),
          collections: chips[row.id] || [],
        });
      }),

      q,
      fav,
      total,
      totalAll:
        search || favorite || collection || promptFilter
          ? Generation.count()
          : total,
      collection,
      prompt: promptFilter,
      promptName: promptRow ? promptRow.name : null,
      filtered: Boolean(q || favorite || collection || promptFilter),
      headline: emptyHeadline(criteria),
      note: emptyNote(criteria, promptRow ? promptRow.name : null),
      collectionList: Collection.all().map((row) =>
        Object.assign({}, row, { shared: Boolean(row.share_token) })
      ),

      page,
      totalPages,
      pageSize,
      ...listLinks(criteria, page),
    };
  }

  return {
    /**
     * Show one page of the saved images, newest first.
     */
    index(req, res) {
      const criteria = readCriteria(req);

      const total = Generation.count({
        search: criteria.search,
        favorite: criteria.favorite,
        collectionId: criteria.collection,
        promptId: criteria.promptFilter,
      });
      const settings = req.settings;
      const paging = readPaging(req, settings, total);

      res.render("generations", listView(criteria, { ...paging, total, settings }));
    },

    /**
     * Show an edit over the image it was made from, with a slider between them.
     */
    compare(req, res) {
      const id = parseId(req.params.id);
      const edit = id ? Generation.get(id) : null;
      const original =
        edit && edit.edited_from ? Generation.get(edit.edited_from) : null;

      if (!edit || !original) return notFound(res);

      res.render("compare", {
        title: "Compare",
        active: "generations",
        edit,
        original,
      });
    },

    /**
     * Remember which layout to use, and go back to the page it was chosen on.
     */
    setView(req, res) {
      const asked = field(req.body, "view");
      if (LAYOUTS.includes(asked)) {
        Settings.update({ list_view: asked === "list" ? 1 : 0 });
      }

      res.redirect(
        pageLink(PAGES.generations, field(req.body, "page"), carriedFrom(req.body))
      );
    },

    /**
     * Move one saved image to the trash.
     */
    remove(req, res) {
      const id = parseId(req.params.id);
      if (id) Generation.trash(id);
      res.redirect(PAGES.generations);
    },

    /**
     * Delete several saved images at once.
     */
    bulkDelete(req, res) {
      const rows = idRows(req.body, "ids", (id) => Generation.get(id));

      if (!rows.length) return res.redirect(PAGES.generations);

      if (!confirmed(req)) {
        return renderConfirm(res, {
          title: "Delete images",
          active: "generations",
          heading: `Move ${rows.length} images to the trash?`,
          detail:
            "They leave the list and any shared link stops working. Nothing is destroyed until you empty the trash.",
          action: `${PAGES.generations}/bulk-delete`,
          backUrl: PAGES.generations,
          rows,
          label: (row) => row.prompt || row.filename,
        });
      }

      ops.trashImages(rows.map((row) => row.id));

      res.redirect(PAGES.generations);
    },

    /**
     * Flip whether a saved image is a favorite.
     */
    favorite(req, res) {
      const id = parseId(req.params.id);
      const row = id ? Generation.get(id) : null;
      if (!row) {
        return problem(res, 404, "That image is not saved.");
      }

      res.json({ favorite: Generation.toggleFavorite(id) });
    },
  };
};
