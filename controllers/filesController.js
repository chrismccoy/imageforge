/**
 * Files controller
 */

"use strict";

const { PAGES } = require("../config/urls");
const { PRIVATE_IMAGE_CACHE } = require("../config/limits");
const { idRows } = require("../utils/http/request");
const { parseId } = require("../utils/domain/coerce");
const { uploadPath, uploadsDirFor } = require("../utils/files/uploads");
const { presentFiles, sendZip } = require("../utils/files/zip");
const { isoDate } = require("../utils/domain/format");
const { requireDeps } = require("./support/helpers/requireDeps");

/**
 * Build the files controller.
 */
module.exports = (deps) => {
  const {
    models,
    folders = {},
    log = console,
  } = requireDeps(deps, ["models"], "filesController");
  const { Generation } = models;
  const uploadDir = uploadsDirFor(folders);

  return {
    /**
     * Serve a saved image inline.
     */
    serveUpload(req, res) {
      const { full } = uploadPath(req.params.filename, uploadDir);
      res.sendFile(full, { headers: PRIVATE_IMAGE_CACHE }, (err) => {
        if (err && !res.headersSent) {
          res.status(404).end();
        }
      });
    },

    /**
     * Send one saved image as a file download rather than opening it in the
     * browser.
     */
    download(req, res) {
      const id = parseId(req.params.id);
      const row = id ? Generation.get(id) : null;
      if (!row) {
        return res.redirect(PAGES.generations);
      }
      const { safe, full } = uploadPath(row.filename, uploadDir); // keep the path inside the uploads folder
      res.download(full, safe, (err) => {
        if (err && !res.headersSent) {
          res.redirect(PAGES.generations);
        }
      });
    },

    /**
     * Send every saved image as one zip download.
     */
    async downloadAll(req, res) {
      const files = await presentFiles(Generation.all(), uploadDir);
      if (files.length === 0) return res.redirect(PAGES.generations);

      await sendZip(res, files, `image-forge-generations-${isoDate()}.zip`, {
        log,
      });
    },

    /**
     * Send the chosen saved images as one zip.
     */
    async bulkDownload(req, res) {
      const rows = idRows(req.body, "ids", (id) => Generation.get(id));

      const files = await presentFiles(rows, uploadDir);
      if (files.length === 0) return res.redirect(PAGES.generations);

      await sendZip(res, files, `image-forge-selected-${isoDate()}.zip`, { log });
    },
  };
};
