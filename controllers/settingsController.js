/**
 * Settings controller
 */

"use strict";

const { FAVOURITES_PREFIX, PAGES } = require("../config/urls");
const { brandName, brandIcon } = require("../config/brand");
const { env } = require("../config/env");
const { ALLOWED_SIZES, MODELS, MODEL_TOKENS } = require("../config/images");
const { DEFAULT_PAGE_SIZE } = require("../config/limits");
const { TOGGLE_COLUMNS } = require("../config/toggles");
const { maskKey } = require("../utils/domain/mask");
const { field } = require("../utils/http/request");
const { toTrimmedString } = require("../utils/domain/coerce");
const { newShareToken } = require("../utils/domain/shareToken");
const { requireDeps } = require("./support/helpers/requireDeps");

/**
 * Build the settings controller
 */
module.exports = (deps) => {
  const {
    models,
    openaiCredentials,
    settings: envValues = env,
  } = requireDeps(deps, ["models", "openaiCredentials"], "settingsController");
  const { Settings, ModelPrice } = models;

  /**
   * Hand one model's rate fields to the price model.
   */
  function savePrice(body, token, nowIso) {
    ModelPrice.applyRates(
      MODELS[token],
      field(body, `price_in_${token}`),
      field(body, `price_out_${token}`),
      nowIso
    );
  }

  /**
   * Build the values the settings page needs.
   */
  function viewModel(req, overrides) {
    const settings = req.settings;
    return Object.assign(
      {
        title: "Settings",
        active: "settings",
        settings,
        sizes: ALLOWED_SIZES,
        models: MODEL_TOKENS,
        modelIds: MODELS,
        hasStoredKey: Boolean(toTrimmedString(settings.api_key)),
        envFallback: openaiCredentials.apiKeyFromEnv(),
        keyMasked: maskKey(openaiCredentials.apiKey()),
        pageFallback: envValues.GENERATIONS_PER_PAGE || DEFAULT_PAGE_SIZE,
        shareFallback: envValues.PUBLIC_SHARE,
        galleryFallback: envValues.PUBLIC_GALLERY,
        slugFallback: envValues.PUBLIC_SHARE_SLUG,
        collectionsFallback: envValues.PUBLIC_COLLECTIONS,
        favouritesFallback: envValues.PUBLIC_FAVOURITES,
        favouritesPrefix: FAVOURITES_PREFIX,
        branding: {
          name: settings.brand_name || "",
          icon: settings.brand_icon || "",
          nameFallback: brandName(null, envValues.BRAND_NAME),
          iconFallback: brandIcon(null, envValues.BRAND_ICON),
        },
        modelPrices: ModelPrice.all(),
        pricesUpdatedAt: ModelPrice.updatedAt(),
        access: {
          user: envValues.ADMIN_USERNAME,
          allowList: envValues.ALLOWED_IPS.length,
          trustProxy: envValues.TRUST_PROXY,
        },
        error: null,
        saved: false,
      },
      overrides || {}
    );
  }

  return {
    /**
     * Show the settings form.
     */
    index(req, res) {
      res.render("settings", viewModel(req));
    },

    /**
     * Put the favourites view behind a public link.
     */
    shareFavourites(req, res) {
      Settings.shareFavourites(newShareToken);
      res.redirect(PAGES.settings);
    },

    /**
     * Revoke the link. Every URL under it dies at once.
     */
    unshareFavourites(req, res) {
      Settings.unshareFavourites();
      res.redirect(PAGES.settings);
    },

    /**
     * Save the settings, then show the form again with a saved message.
     */
    update(req, res) {
      const default_size = field(req.body, "default_size", { trim: false });
      const model = field(req.body, "model", { trim: false });
      const page_size = field(req.body, "page_size");
      const brand_name = field(req.body, "brand_name");
      const brand_icon = field(req.body, "brand_icon");

      const toggles = Object.fromEntries(
        TOGGLE_COLUMNS.map((column) => [column, Boolean(field(req.body, column))])
      );

      if (toggles.public_gallery && !toggles.public_share) {
        return res.render(
          "settings",
          viewModel(req, {
            error: "The public gallery needs public sharing turned on as well.",
          })
        );
      }

      let api_key;
      const submitted = field(req.body, "api_key");
      if (submitted) api_key = submitted;

      Settings.update({
        default_size,
        model,
        api_key,
        page_size,
        brand_name,
        brand_icon,
        brand_mark: Boolean(field(req.body, "brand_mark")),
        ...toggles,
      });
      req.settingsChanged();

      const now = new Date().toISOString();
      MODEL_TOKENS.forEach((token) => savePrice(req.body, token, now));

      res.render("settings", viewModel(req, { saved: true }));
    },
  };
};
