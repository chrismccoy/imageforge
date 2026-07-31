/**
 * Settings model
 *
 * Reads and writes the single settings row
 */

"use strict";

const { toStoredName, toStoredIcon } = require("../config/brand");
const { normalizeSize, normalizeModel } = require("../config/images");
const { MAX_PAGE_SIZE } = require("../config/limits");
const { TOGGLE_COLUMNS } = require("../config/toggles");
const { toTrimmedString } = require("../utils/domain/coerce");
const secretBox = require("../utils/security/secretBox");
const { allocateToken } = require("./allocateToken");

/**
 * Force a page size to a whole number in range
 */
function normalizePageSize(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return 0;
  return Math.min(n, MAX_PAGE_SIZE);
}

/**
 * Force a toggle to 1, 0, or null for "not set".
 */
function normalizeToggle(value) {
  if (value === null) return null;
  return value ? 1 : 0;
}

/**
 * What to write into the api_key column, given what the form sent.
 */
function storedKeyFor(submitted, current, secrets, warn = console.warn) {
  if (submitted === undefined) return current;
  if (submitted && secrets.available()) return secrets.encrypt(submitted);
  if (submitted) {
    warn(
      "Storing the API key without encryption; set SETTINGS_ENC_KEY to encrypt it at rest."
    );
  }
  return submitted;
}

/**
 * Build the settings model against a database connection.
 */
module.exports = (db, { secrets = secretBox, log = console } = {}) => {
  const stmts = {
    get: db.prepare(
      `SELECT default_size, model, api_key, page_size, public_share, public_gallery,
              public_share_slug, public_collections, public_favourites,
              favourites_token, list_view, brand_name, brand_icon, brand_mark
       FROM settings WHERE id = 1`
    ),
    update: db.prepare(
      `UPDATE settings SET default_size = @default_size, model = @model,
         api_key = @api_key, page_size = @page_size,
         public_share = @public_share, public_gallery = @public_gallery,
         public_share_slug = @public_share_slug,
         public_collections = @public_collections,
         public_favourites = @public_favourites,
         list_view = @list_view,
         brand_name = @brand_name, brand_icon = @brand_icon,
         brand_mark = @brand_mark
       WHERE id = 1`
    ),
  };

  const tokenStmts = {
    set: db.prepare("UPDATE settings SET favourites_token = ? WHERE id = 1"),
    byToken: db.prepare(
      "SELECT favourites_token FROM settings WHERE favourites_token = ?"
    ),
  };

  return {
    /**
     * Share the favourites view, returning its new token.
     */
    shareFavourites(makeToken, attempts) {
      return allocateToken(
        makeToken,
        (token) => tokenStmts.set.run(token),
        attempts
      );
    },

    /**
     * Revoke the link. Every URL under it dies at once.
     */
    unshareFavourites() {
      return tokenStmts.set.run(null).changes > 0;
    },

    /**
     * Whether this is the live favourites token.
     */
    favouritesTokenIs(token) {
      const clean = toTrimmedString(token);
      return Boolean(clean) && Boolean(tokenStmts.byToken.get(clean));
    },

    /**
     * Read the settings row. The stored API key is decrypted.
     */
    get() {
      const row = stmts.get.get();
      if (row && secrets.isEncrypted(row.api_key)) {
        try {
          row.api_key = secrets.decrypt(row.api_key);
        } catch (err) {
          log.error("Could not decrypt the stored API key:", err.message);
          row.api_key = "";
        }
      }
      return row ?? null;
    },

    /**
     * Update the settings. A new API key is encrypted at rest when encryption is configured
     */
    update(changes) {
      const {
        default_size,
        model,
        api_key,
        page_size,
        list_view,
        brand_name,
        brand_icon,
        brand_mark,
      } = changes;
      const current = stmts.get.get();

      const stored = storedKeyFor(api_key, current.api_key, secrets, log.warn);

      const toggles = Object.fromEntries(
        TOGGLE_COLUMNS.map((column) => [
          column,
          changes[column] === undefined
            ? current[column]
            : normalizeToggle(changes[column]),
        ])
      );

      return (
        stmts.update.run({
          default_size: normalizeSize(default_size, current.default_size),
          model: normalizeModel(model, current.model),
          api_key: stored,
          page_size:
            page_size === undefined
              ? current.page_size
              : normalizePageSize(page_size),
          list_view:
            list_view === undefined ? current.list_view : list_view ? 1 : 0,
          brand_name:
            brand_name === undefined
              ? current.brand_name
              : toStoredName(brand_name),
          brand_icon:
            brand_icon === undefined
              ? current.brand_icon
              : toStoredIcon(brand_icon),
          brand_mark:
            brand_mark === undefined
              ? current.brand_mark
              : normalizeToggle(brand_mark),
          ...toggles,
        }).changes > 0
      );
    },
  };
};
