/**
 * Brand, on every template
 */

"use strict";

const { resolveBrand } = require("../config/brand");
const { env } = require("../config/env");

/**
 * Build the middleware that puts `brand` on every template
 */
function createBrand({ settings = env } = {}) {
  return function brand(req, res, next) {
    let value;

    Object.defineProperty(res.locals, "brand", {
      configurable: true,
      enumerable: true,
      get() {
        if (value === undefined) value = resolveBrand(req.settings || {}, settings);
        return value;
      },
    });

    next();
  };
}

module.exports = { createBrand };
