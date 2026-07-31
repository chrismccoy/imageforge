/**
 * Image extensions in URLs
 */

"use strict";

const SERVABLE = ["png", "jpg", "jpeg", "webp"];

const CANONICAL = { jpeg: "jpg" };

/**
 * Fold an extension to the spelling stored names use.
 */
function canonical(ext) {
  return CANONICAL[ext] || ext;
}

/**
 * Split a servable extension off a URL segment.
 */
function splitImageExt(segment) {
  const value = String(segment == null ? "" : segment);
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return { name: value, ext: "" };

  const ext = value.slice(dot + 1).toLowerCase();
  if (!SERVABLE.includes(ext)) return { name: value, ext: "" };

  return { name: value.slice(0, dot), ext };
}

/**
 * The servable extension a stored file name carries, or an empty string.
 */
function extensionOf(filename) {
  return splitImageExt(filename).ext;
}

/**
 * Whether a URL's extension is valid about the file behind it.
 */
function extMatches(filename, ext) {
  if (!ext) return true;

  const own = extensionOf(filename);
  return own !== "" && canonical(own) === canonical(ext);
}

module.exports = { splitImageExt, extensionOf, extMatches, SERVABLE };
