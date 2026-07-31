/**
 * Categories controller
 */

"use strict";

const { buildNamedListController } = require("./support/builders/namedList");
const { PAGES } = require("../config/urls");
const { requireDeps } = require("./support/helpers/requireDeps");

const TAKEN = "That name is blank or already in use.";

/**
 * Build the categories controller.
 */
module.exports = (deps) => {
  const { models } = requireDeps(deps, ["models"], "categoriesController");
  const { Category } = models;

  return buildNamedListController({
    list: Category,
    view: "categories",
    path: PAGES.categories,
    title: "Categories",
    active: "categories",
    taken: TAKEN,
    locals: () => ({ categories: Category.all() }),
  });
};
