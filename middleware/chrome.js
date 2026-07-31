/**
 * Sidebar shell
 */

"use strict";

const { storageFigures } = require("../utils/domain/storage");

/**
 * Build the middleware against the models and the app's own usage reader.
 */
function chromeFigures({ models, usage }) {
  const { Generation, Prompt, Category, Collection } = models;

  return async function (req, res, next) {
    try {
      const used = await usage.bytes();

      res.locals.chrome = {
        counts: {
          generations: Generation.count(),
          prompts: Prompt.count(),
          categories: Category.all().length,
          collections: Collection.all().length,
          favourites: Generation.count({ favorite: true }),
          gallery: Generation.countShared(),
          trash: Generation.trashed().length,
        },
        storage: storageFigures(used, usage.quotaBytes),
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { chromeFigures };
