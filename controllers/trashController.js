/**
 * Trash controller
 */

"use strict";

const fs = require("fs");

const { parseId } = require("../utils/domain/coerce");
const { PAGES } = require("../config/urls");
const { confirmed, renderConfirm } = require("../utils/http/confirm");
const { uploadPath, uploadsDirFor } = require("../utils/files/uploads");
const { requireUsage } = require("../services/uploadsUsage");
const { storageFigures } = require("../utils/domain/storage");
const { requireDeps } = require("./support/helpers/requireDeps");

/**
 * Build the trash controller
 */
module.exports = (deps) => {
  const {
    models,
    folders = {},
    usage,
    log = console,
  } = requireDeps(deps, ["models"], "trashController");
  const { Generation, ops } = models;
  const uploadDir = uploadsDirFor(folders);
  const room = requireUsage(usage, "trashController");

  /**
   * Destroy one trashed image, file and all.
   */
  function destroy(row) {
    ops.purgeImage(row.id);

    const { safe, full } = uploadPath(row.filename, uploadDir);
    fs.unlink(full, (err) => {
      if (err && err.code !== "ENOENT") {
        log.error(`Could not delete file ${safe}:`, err.message);
      }
    });
    room.forget();
  }

  return {
    /**
     * Show what is in the trash.
     */
    async index(req, res) {
      const storage = storageFigures(await room.bytes(), room.quotaBytes);

      res.render("trash", {
        title: "Trash",
        active: "trash",
        rows: Generation.trashed(),
        storageUsed: storage.used,
        storageQuota: storage.quota,
      });
    },

    /**
     * Put one image back, exactly as it was.
     */
    restore(req, res) {
      const id = parseId(req.params.id);
      if (id) Generation.restore(id);
      res.redirect(PAGES.trash);
    },

    /**
     * Destroy one image for good.
     */
    purge(req, res) {
      const id = parseId(req.params.id);
      const row = id ? Generation.getAnyState(id) : null;
      if (row && row.deleted_at) destroy(row);
      res.redirect(PAGES.trash);
    },

    /**
     * Destroy everything in the trash, asking first.
     */
    empty(req, res) {
      const rows = Generation.trashed();
      if (!rows.length) return res.redirect(PAGES.trash);

      if (!confirmed(req)) {
        return renderConfirm(res, {
          title: "Empty the trash",
          active: "trash",
          heading: `Destroy ${rows.length} images?`,
          detail: "This cannot be undone. The files are removed from disk as well.",
          action: `${PAGES.trash}/empty`,
          backUrl: PAGES.trash,
          rows,
          label: (row) => row.prompt || row.filename,
        });
      }

      rows.forEach(destroy);
      res.redirect(PAGES.trash);
    },
  };
};
