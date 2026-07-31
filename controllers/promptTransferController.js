/**
 * Prompt transfer controller
 */

"use strict";

const { toExport, parseImport } = require("../utils/domain/promptTransfer");
const { BACKUP_DIR, listBackups } = require("../utils/files/backups");
const { isoDate } = require("../utils/domain/format");
const { requireDeps } = require("./support/helpers/requireDeps");

/**
 * Build the prompt transfer controller.
 */
module.exports = (deps) => {
  const {
    models,
    folders = {},
    log = console,
  } = requireDeps(deps, ["models"], "promptTransferController");
  const { Prompt, ops } = models;
  const backupDir = folders.backupDir || BACKUP_DIR;

  /**
   * Render the backup page, with whatever an import just reported.
   */
  function renderBackup(res, overrides = {}) {
    const target = overrides.status ? res.status(overrides.status) : res;
    return target.render(
      "backup",
      Object.assign(
        {
          title: "Backup & Transfer",
          active: "backup",
          backups: listBackups(backupDir),
          importResult: null,
          importError: null,
        },
        overrides
      )
    );
  }

  return {
    /**
     * Show the import and export page.
     */
    index(req, res) {
      renderBackup(res);
    },

    /**
     * Send every saved prompt as a JSON download.
     */
    exportAll(req, res) {
      const now = new Date();
      const file = toExport(Prompt.all(), now.toISOString());

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="imageforge-prompts-${isoDate(now)}.json"`
      );
      res.type("application/json").send(JSON.stringify(file, null, 2));
    },

    /**
     * Load prompts from an uploaded file.
     */
    importFile(req, res) {
      if (req.uploadError) {
        return renderBackup(res, { importError: req.uploadError, status: 400 });
      }

      const file = req.file;
      if (!file || !file.buffer || !file.buffer.length) {
        return renderBackup(res, {
          importError: "Choose a file to import.",
          status: 400,
        });
      }

      const parsed = parseImport(file.buffer.toString("utf8"));
      if (parsed.error) {
        return renderBackup(res, { importError: parsed.error, status: 400 });
      }

      let stored;
      try {
        stored = ops.importPrompts(parsed.entries, new Date().toISOString());
      } catch (err) {
        log.error("Could not import prompts:", err.message);
        return renderBackup(res, {
          importError: "The import failed. Nothing was imported.",
          status: 400,
        });
      }

      renderBackup(res, {
        importResult: Object.assign({ ignored: parsed.ignored }, stored),
      });
    },
  };
};
