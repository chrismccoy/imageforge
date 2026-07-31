/**
 * Link preview cards
 */

"use strict";

const { absoluteUrl } = require("./origin");

/**
 * The card for one public page.
 */
function linkCard(req, { title, imagePath }) {
  return {
    title,
    url: absoluteUrl(req, req.originalUrl),
    image: imagePath ? absoluteUrl(req, imagePath) : "",
  };
}

module.exports = { linkCard };
