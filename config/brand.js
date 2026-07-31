/**
 * Brand
 */

"use strict";

const { toTrimmedString } = require("../utils/domain/coerce");

const DEFAULT_BRAND_NAME = "Image Forge";
const DEFAULT_BRAND_ICON = "fa-solid fa-bolt";

// Long enough for a real product name, short enough that the sidebar, the
// public header and the title tag all still fit one.
const MAX_BRAND_NAME = 40;

// Every class Font Awesome begins fa-.
const ICON_TOKEN = /^fa-[a-z0-9-]+$/;

// A style and a name, and room for one modifier.
const MAX_ICON_TOKENS = 3;

/**
 * What goes in the brand_name column: a clean name, or null for "not set".
 */
function toStoredName(value) {
  const clean = toTrimmedString(value);
  return clean ? clean.slice(0, MAX_BRAND_NAME) : null;
}

/**
 * What goes in the brand_icon column: a valid Font Awesome class list, or null.
 */
function toStoredIcon(value) {
  const clean = toTrimmedString(value).toLowerCase();
  if (!clean) return null;

  const tokens = clean.split(/\s+/);
  if (tokens.length > MAX_ICON_TOKENS) return null;
  if (!tokens.every((token) => ICON_TOKEN.test(token))) return null;

  return tokens.join(" ");
}

/**
 * The name to show, given the saved value and the environment's.
 */
function brandName(stored, envValue) {
  return toStoredName(stored) || toStoredName(envValue) || DEFAULT_BRAND_NAME;
}

/**
 * The mark to draw, given the saved value and the environment's.
 */
function brandIcon(stored, envValue) {
  return toStoredIcon(stored) || toStoredIcon(envValue) || DEFAULT_BRAND_ICON;
}

/**
 * Whether the public footer carries its "Made with ..." line.
 */
function brandMark(stored) {
  return stored !== 0;
}

/**
 * The whole brand, from a settings row and the environment.
 */
function resolveBrand(row, settings) {
  return {
    name: brandName(row.brand_name, settings.BRAND_NAME),
    icon: brandIcon(row.brand_icon, settings.BRAND_ICON),
    mark: brandMark(row.brand_mark),
  };
}

module.exports = {
  DEFAULT_BRAND_NAME,
  DEFAULT_BRAND_ICON,
  MAX_BRAND_NAME,
  toStoredName,
  toStoredIcon,
  brandName,
  brandIcon,
  brandMark,
  resolveBrand,
};
