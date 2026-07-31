/**
 * Public access switches
 */

"use strict";

const TOGGLES = [
  { key: "sharing", column: "public_share", env: "PUBLIC_SHARE" },
  { key: "gallery", column: "public_gallery", env: "PUBLIC_GALLERY" },
  { key: "slug", column: "public_share_slug", env: "PUBLIC_SHARE_SLUG" },
  { key: "collections", column: "public_collections", env: "PUBLIC_COLLECTIONS" },
  { key: "favourites", column: "public_favourites", env: "PUBLIC_FAVOURITES" },
];

const TOGGLE_COLUMNS = TOGGLES.map((toggle) => toggle.column);

module.exports = { TOGGLES, TOGGLE_COLUMNS };
