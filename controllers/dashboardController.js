/**
 * Dashboard controller
 */

"use strict";

const { requireUsage } = require("../services/uploadsUsage");
const { storageFigures } = require("../utils/domain/storage");
const { formatCost, costedModels } = require("../utils/domain/cost");
const { buildOutputChart } = require("../utils/domain/outputChart");
const { buildShareUrls } = require("../utils/domain/shareUrl");
const { DAY_MS } = require("../utils/domain/time");
const { requireDeps } = require("./support/helpers/requireDeps");

const RECENT = 6;
const TOP = 5;

const CHART_DAYS = 30;
const CHART_HEIGHT = 96;

/**
 * Build the dashboard controller
 */
module.exports = (deps) => {
  const { models, access, usage } = requireDeps(
    deps,
    ["models", "access"],
    "dashboardController"
  );
  const room = requireUsage(usage, "dashboardController");
  const { Generation, Prompt, Collection, Category, Stats, ModelPrice } = models;

  return {
    /**
     * Show the dashboard.
     */
    async index(req, res) {
      const now = Date.now();
      const prices = ModelPrice.all();

      const byModel = costedModels(Stats.byModel(), prices);

      const priced = byModel.filter((row) => row.rawCost !== null);
      const spend = priced.reduce((sum, row) => sum + row.rawCost, 0);

      const storage = storageFigures(await room.bytes(), room.quotaBytes);
      const useSlug = access.slug(req.settings);

      /**
       * A row trimmed to what a widget thumbnail needs.
       */
      const asCard = (row) =>
        Object.assign({}, row, {
          share_image: buildShareUrls(row, useSlug).image,
        });

      const prompts = Prompt.all();

      const collectionsWidget = Collection.all()
        .slice()
        .sort((a, b) => b.images - a.images)
        .slice(0, TOP)
        .map((row) => ({
          id: row.id,
          name: row.name,
          images: row.images,
          shared: Boolean(row.share_token),
        }));

      const output = buildOutputChart(Stats.perDay(CHART_DAYS), prices, {
        days: CHART_DAYS,
        height: CHART_HEIGHT,
      });

      res.render("dashboard", {
        title: "Dashboard",
        active: "dashboard",

        images: Stats.total(),
        week: Stats.countSince(new Date(now - 7 * DAY_MS).toISOString()),
        favourites: Generation.count({ favorite: true }),
        promptCount: prompts.length,
        collectionCount: Collection.all().length,
        categoryCount: Category.all().length,

        spend: priced.length ? formatCost(spend) : null,
        byModel,
        output,
        collectionsWidget,

        storageUsed: storage.used,
        storageQuota: storage.quota,
        storagePercent: storage.percent,

        recent: Generation.page({ limit: RECENT, offset: 0 }).map(asCard),
        favouriteImages: Generation.page({
          favorite: true,
          limit: RECENT,
          offset: 0,
        }).map(asCard),

        topRated: prompts
          .filter((row) => row.rating)
          .sort((a, b) => b.rating - a.rating)
          .slice(0, TOP),
        mostUsed: prompts
          .filter((row) => row.uses > 0)
          .sort((a, b) => b.uses - a.uses)
          .slice(0, TOP),
      });
    },
  };
};
