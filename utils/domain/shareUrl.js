/**
 * Share URLs
 */

"use strict";

const { slugify } = require("./slug");
const { extensionOf } = require("./imageExt");
const { SHARE_PREFIX, IMAGE_PREFIX } = require("../../config/urls");

const NOT_SHARED = { link: null, image: null };

/**
 * The public URLs for a saved image. Both are null when it has not been shared.
 */
function buildShareUrls(row, useSlug) {
  const token = row && row.share_token;
  if (!token) return NOT_SHARED;

  const slug = useSlug ? slugify(row.prompt) : "";
  const path = slug ? `${slug}-${token}` : token;

  const ext = extensionOf(row.filename);

  return {
    link: `${SHARE_PREFIX}/${path}`,
    image: ext ? `${IMAGE_PREFIX}/${path}.${ext}` : `${IMAGE_PREFIX}/${path}`,
  };
}

/**
 * The app-relative URL of one image's picture inside a token's link.
 */
function tokenImagePath(prefix, token, row) {
  const ext = extensionOf(row.filename);
  const base = `${prefix}/${token}/i/${row.id}`;
  return ext ? `${base}.${ext}` : `${base}/file`;
}

/**
 * The images a public grid shows: where each one links, and what it shows.
 */
function tokenTiles(prefix, token, rows) {
  return rows.map((row) => ({
    id: row.id,
    href: `${prefix}/${token}/i/${row.id}`,
    src: tokenImagePath(prefix, token, row),
  }));
}

module.exports = { buildShareUrls, NOT_SHARED, tokenImagePath, tokenTiles };
