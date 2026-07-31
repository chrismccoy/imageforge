/**
 * Backup
 *
 * Writes the whole install to one zip: the database, every upload, a readable
 * copy of the prompts, and a manifest.
 *
 *   node scripts/backup.js
 *   node scripts/backup.js --out /Volumes/stick/forge.zip
 *
 */

"use strict";

const path = require("path");

const { DB_PATH, UPLOAD_DIR } = require("../config/paths");
const { writeArchive } = require("../utils/files/archive/write");
const { BACKUP_DIR, backupName } = require("../utils/files/backups");

/**
 * The value after a flag, or null.
 */
function flag(args, name) {
  const at = args.indexOf(name);
  return at !== -1 && args[at + 1] ? args[at + 1] : null;
}

async function main() {
  const args = process.argv.slice(2);
  const dbPath = DB_PATH;
  const uploadDir = UPLOAD_DIR;

  const chosen = flag(args, "--out");
  const outPath = chosen
    ? path.resolve(chosen)
    : path.join(BACKUP_DIR, backupName(new Date()));

  const manifest = await writeArchive({ dbPath, uploadDir, outPath });
  const { counts, missingFiles } = manifest;

  console.log(`Wrote ${outPath}`);
  console.log(
    `  ${counts.prompts} prompts, ${counts.generations} generations, ` +
      `${counts.collections} collections, ` +
      `${counts.uploads} image${counts.uploads === 1 ? "" : "s"}`
  );
  if (missingFiles) {
    console.log(
      `  ${missingFiles} row${missingFiles === 1 ? "" : "s"} had no file on disk and were skipped`
    );
  }
  console.log("  no .env and no API key are in this archive");
}

main().catch((err) => {
  console.error(`Backup failed: ${err.message}`);
  process.exit(1);
});
