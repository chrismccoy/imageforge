/**
 * Trash controller
 */

"use strict";

const fs = require("fs");

const { parseId } = require("../utils/domain/coerce");
const { idList } = require("../utils/http/request");
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
  async function destroy(row) {
    ops.purgeImage(row.id);

    const { safe, full } = uploadPath(row.filename, uploadDir);
    try {
      await fs.promises.unlink(full);
    } catch (err) {
      if (err.code !== "ENOENT") {
        log.error(`Could not delete file ${safe}:`, err.message);
      }
    }
  }

  /**
   * Destroy trashed images, then drop the cached size once the files are gone.
   */
  async function destroyAll(rows) {
    try {
      await Promise.all(rows.map(destroy));
    } finally {
      room.forget();
    }
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
    async purge(req, res) {
      const id = parseId(req.params.id);
      const row = id ? Generation.getAnyState(id) : null;
      if (row && row.deleted_at) await destroyAll([row]);
      res.redirect(PAGES.trash);
    },

    /**
     * Destroy everything in the trash, asking first. The confirmation destroys
     * only the images it listed that are still in the trash.
     */
    async empty(req, res) {
      const trashed = Generation.trashed();
      if (!trashed.length) return res.redirect(PAGES.trash);

      if (!confirmed(req)) {
        const count = trashed.length;
        return renderConfirm(res, {
          title: "Empty the trash",
          active: "trash",
          heading: `Destroy ${count} ${count === 1 ? "image" : "images"}?`,
          detail: "This cannot be undone. The files are removed from disk as well.",
          action: `${PAGES.trash}/empty`,
          backUrl: PAGES.trash,
          rows: trashed,
          label: (row) => row.prompt || row.filename,
        });
      }

      const listed = new Set(idList(req.body, "ids", Infinity));
      await destroyAll(trashed.filter((row) => listed.has(row.id)));
      res.redirect(PAGES.trash);
    },
  };
};
