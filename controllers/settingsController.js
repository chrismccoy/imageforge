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
const { toTrimmedString, parseFlag } = require("../utils/domain/coerce");
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
   * The rate pair a form sent for one model.
   */
  function pricesFrom(body, token) {
    return [field(body, `price_in_${token}`), field(body, `price_out_${token}`)];
  }

  /**
   * The settings and prices as submitted, for showing a refused form again.
   * The API key is never echoed back.
   */
  function submittedView(req, values) {
    const modelPrices = {};
    MODEL_TOKENS.forEach((token) => {
      const [input, output] = pricesFrom(req.body, token);
      if (input || output) modelPrices[MODELS[token]] = { input, output };
    });

    const settings = { ...req.settings, ...values };
    for (const column of ["brand_mark", ...TOGGLE_COLUMNS]) {
      settings[column] = settings[column] ? 1 : 0;
    }
    return { settings, modelPrices };
  }

  /**
   * Build the values the settings page needs.
   */
  function viewModel(req, overrides = {}) {
    const settings = overrides.settings || req.settings;
    const stored = req.settings;
    return Object.assign(
      {
        title: "Settings",
        active: "settings",
        settings,
        sizes: ALLOWED_SIZES,
        models: MODEL_TOKENS,
        modelIds: MODELS,
        hasStoredKey: Boolean(toTrimmedString(stored.api_key)),
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
      overrides
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
      const values = {
        default_size: field(req.body, "default_size", { trim: false }),
        model: field(req.body, "model", { trim: false }),
        page_size: field(req.body, "page_size"),
        brand_name: field(req.body, "brand_name"),
        brand_icon: field(req.body, "brand_icon"),
        brand_mark: parseFlag(field(req.body, "brand_mark")),
      };

      const toggles = Object.fromEntries(
        TOGGLE_COLUMNS.map((column) => [column, parseFlag(field(req.body, column))])
      );

      const refuse = (error) =>
        res.status(400).render(
          "settings",
          viewModel(req, {
            ...submittedView(req, { ...values, ...toggles }),
            error,
          })
        );

      if (toggles.public_gallery && !toggles.public_share) {
        return refuse("The public gallery needs public sharing turned on as well.");
      }

      const unpriced = MODEL_TOKENS.find(
        (token) => !ModelPrice.ratesFrom(...pricesFrom(req.body, token))
      );
      if (unpriced) {
        return refuse(
          `Give ${MODELS[unpriced]} both an input and an output price, or leave both empty.`
        );
      }

      let api_key;
      const submitted = field(req.body, "api_key");
      if (submitted) api_key = submitted;
      else if (parseFlag(field(req.body, "clear_api_key"))) api_key = "";

      Settings.update({ ...values, api_key, ...toggles });
      req.settingsChanged();

      const now = new Date().toISOString();
      MODEL_TOKENS.forEach((token) =>
        ModelPrice.applyRates(MODELS[token], ...pricesFrom(req.body, token), now)
      );

      res.render("settings", viewModel(req, { saved: true }));
    },
  };
};
