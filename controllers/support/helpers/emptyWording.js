/**
 * What an empty generations list says
 */

"use strict";

/**
 * What to say when the list came back empty.
 */
function emptyHeadline({ q, favorite, collection, promptFilter }) {
  const cases = [
    { when: favorite, matching: "No favourites", empty: "No favourites yet" },
    {
      when: collection === "none",
      matching: "No unfiled images",
      empty: "Every image is in a collection",
    },
    {
      when: collection,
      matching: "No images in this collection",
      empty: "Nothing in this collection yet",
    },
    {
      when: promptFilter,
      matching: "No images from this prompt",
      empty: "Nothing made from this prompt yet",
    },
    { when: q, matching: "No generations" },
  ];

  const said = cases.find((one) => one.when);
  if (!said) return "No saved generations yet";

  return q ? `${said.matching} match “${q}”` : said.empty;
}

/**
 * The line under an empty list's headline, or null when there is nothing to add.
 */
function emptyNote({ favorite, collection, promptFilter }, promptName) {
  if (favorite) {
    return "Star an image on the Generations page and it will show up here.";
  }
  if (collection && collection !== "none") {
    return "Add images to it from any card, or tick a few and use the toolbar.";
  }
  if (promptFilter && promptName) {
    return `Nothing has been generated from “${promptName}”.`;
  }
  return null;
}

module.exports = { emptyHeadline, emptyNote };
