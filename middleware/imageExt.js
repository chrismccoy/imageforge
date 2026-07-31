/**
 * Image extension in a URL
 */

"use strict";

const { splitImageExt } = require("../utils/domain/imageExt");

/**
 * Split any servable extension off one route parameter.
 */
function imageExtension(param) {
  return function (req, res, next) {
    const { name, ext } = splitImageExt(req.params[param]);

    req.params[param] = name;
    req.imageExt = ext;
    next();
  };
}

module.exports = { imageExtension };
