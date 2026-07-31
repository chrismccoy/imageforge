/**
 * Main router
 */

"use strict";

const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { csrf } = require("../middleware/csrf");
const { notFoundHandler } = require("../middleware/errorHandler");
const { noIndex } = require("../middleware/noIndex");
const { CSS_DIR, JS_DIR, VENDOR_DIR, SCREENSHOTS_DIR } = require("../config/paths");

module.exports = (deps) => {
  const router = express.Router();

  router.use("/css", express.static(CSS_DIR));
  router.use("/js", express.static(JS_DIR));
  router.use("/vendor", express.static(VENDOR_DIR));

  router.use("/screenshots", noIndex, express.static(SCREENSHOTS_DIR));

  router.use(require("./share")(deps));
  router.use(require("./collectionShare")(deps));
  router.use(require("./favouritesShare")(deps));
  router.use(require("./gallery")(deps));

  router.use(deps.ipAllow);

  router.use(csrf);

  router.use(require("./auth")(deps));

  router.use(requireAuth);

  router.use(deps.chromeFigures);

  router.use(require("./generate")(deps));
  router.use(require("./edit")(deps));
  router.use(require("./crop")(deps));
  router.use("/api", require("./api")(deps));
  router.use(require("./prompts")(deps));
  router.use(require("./categories")(deps));
  router.use(require("./collections")(deps));
  router.use(require("./generations")(deps));
  router.use(require("./trash")(deps));
  router.use(require("./backup")(deps));
  router.use(require("./dashboard")(deps));
  router.use(require("./uploads")(deps));
  router.use(require("./settings")(deps));

  router.use(notFoundHandler);

  return router;
};
