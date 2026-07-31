/**
 * URL prefixes
 */

"use strict";

// Public URL prefixes. The routes and the URL builder use these.
const SHARE_PREFIX = "/s";
const IMAGE_PREFIX = "/i";
const COLLECTION_PREFIX = "/c";
const FAVOURITES_PREFIX = "/f";

// Where a saved image is served from behind the login.
const UPLOAD_PREFIX = "/uploads";

const PAGES = {
  dashboard: "/",
  login: "/login",
  logout: "/logout",
  generate: "/generate",
  generations: "/generations",
  gallery: "/gallery",
  upload: "/upload",
  edit: "/edit",
  crop: "/crop",
  prompts: "/prompts",
  promptsBackup: "/prompts/backup",
  backups: "/backups",
  categories: "/categories",
  collections: "/collections",
  trash: "/trash",
  settings: "/settings",
};

module.exports = {
  PAGES,
  SHARE_PREFIX,
  IMAGE_PREFIX,
  COLLECTION_PREFIX,
  FAVOURITES_PREFIX,
  UPLOAD_PREFIX,
};
