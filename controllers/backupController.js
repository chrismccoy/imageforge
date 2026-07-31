/**
 * Backup controller
 */

"use strict";

const fsp = require("fs/promises");
const path = require("path");

const { uploadsDirFor } = require("../utils/files/uploads");
const { PAGES } = require("../config/urls");
const { notFound } = require("../utils/http/pages");
const { writeArchive } = require("../utils/files/archive/write");
const { requireDeps } = require("./support/helpers/requireDeps");
const {
  BACKUP_DIR,
  backupName,
  backupPath,
  listBackups,
} = require("../utils/files/backups");

/**
 * Build the backup controller
 */
module.exports = (deps) => {
  const { db, folders = {} } = requireDeps(deps, ["db"], "backupController");
  const backupDir = folders.backupDir || BACKUP_DIR;
  const uploadDir = uploadsDirFor(folders);

  /**
   * The archive a request names, or null when the name does not name one.
   */
  function namedArchive(req) {
    const where = backupPath(backupDir, req.params.name);
    if (!where) return null;
    return listBackups(backupDir).some((b) => b.name === where.safe) ? where : null;
  }

  return {
    /**
     * Write a new archive and go back to the page.
     */
    async create(req, res, next) {
      try {
        await writeArchive({
          db,
          uploadDir,
          outPath: path.join(backupDir, backupName(new Date())),
        });
        res.redirect(PAGES.promptsBackup);
      } catch (err) {
        next(err);
      }
    },

    /**
     * Send one archive as a download.
     */
    download(req, res) {
      const archive = namedArchive(req);
      if (!archive) return notFound(res);

      res.download(archive.full, archive.safe, (err) => {
        if (err && !res.headersSent) notFound(res);
      });
    },

    /**
     * Delete one archive.
     */
    async remove(req, res, next) {
      const archive = namedArchive(req);
      if (!archive) return notFound(res);

      try {
        await fsp.rm(archive.full, { force: true });
        res.redirect(PAGES.promptsBackup);
      } catch (err) {
        next(err);
      }
    },
  };
};
