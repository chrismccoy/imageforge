/**
 * Gallery controller
 */

"use strict";

const { VIEWS } = require("../config/views");
const { FAVOURITES_PREFIX, PAGES } = require("../config/urls");
const { readPaging } = require("../utils/http/pageRequest");
const { buildShareUrls } = require("../utils/domain/shareUrl");
const { pageLink } = require("../utils/http/pageLink");
const { requireDeps } = require("./support/helpers/requireDeps");

/**
 * Build the gallery controller.
 */
module.exports = (deps) => {
  const { models, access } = requireDeps(
    deps,
    ["models", "access"],
    "galleryController"
  );
  const { Generation } = models;

  return {
    /**
     * Show one page of the shared images, newest first.
     */
    index(req, res) {
      const settings = req.settings;

      const total = Generation.countShared();
      const { page, totalPages, offset, pageSize } = readPaging(
        req,
        settings,
        total
      );

      const useSlug = access.slug(settings);
      const favouritesToken = settings.favourites_token;
      const images = Generation.pageShared({ limit: pageSize, offset }).map(
        (row) => {
          const urls = buildShareUrls(row, useSlug);
          return Object.assign({}, row, {
            share_link: urls.link,
            share_image: urls.image,
          });
        }
      );

      res.render(VIEWS.GALLERY, {
        title: "Generated Images",
        noindex: true,
        favouritesUrl: favouritesToken
          ? `${FAVOURITES_PREFIX}/${favouritesToken}`
          : null,
        images,
        total,
        page,
        totalPages,
        prevUrl: pageLink(PAGES.gallery, page - 1, {}),
        nextUrl: pageLink(PAGES.gallery, page + 1, {}),
      });
    },
  };
};
