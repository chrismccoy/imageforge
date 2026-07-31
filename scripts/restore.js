/**
 * Restore
 *
 * Puts an archive back: the database and the uploads
 *
 *   node scripts/restore.js data/backups/imageforge-20260810-1402.zip
 *   node scripts/restore.js backup.zip --yes
 */

"use strict";

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");
const readline = require("readline");

const Database = require("better-sqlite3");

const { DB_PATH, UPLOAD_DIR } = require("../config/paths");
const schema = require("../db/schema");
const { BACKUP_DIR } = require("../utils/files/backups");
const { writeArchive, ARCHIVE_VERSION } = require("../utils/files/archive/write");
const { readManifest, extractTo } = require("../utils/files/archive/read");
const { gapsBetween } = require("../db/schemaDiff");

const TO_THE_MINUTE = 16;

/**
 * A database holding the schema this code expects, in memory.
 */
function wantedSchema() {
  const db = new Database(":memory:");
  schema.init(db);
  return db;
}

/**
 * Stop, saying why, without having touched anything.
 */
function refuse(lines) {
  console.error(lines.join("\n"));
  process.exit(1);
}

/**
 * Ask before replacing, unless --yes was given.
 */
function confirm(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

/**
 * Replace a folder's contents with another's.
 */
async function swapFolder(from, to) {
  await fsp.mkdir(to, { recursive: true });
  for (const entry of await fsp.readdir(to)) {
    if (entry === ".gitkeep") continue;
    await fsp.rm(path.join(to, entry), { recursive: true, force: true });
  }

  let incoming = [];
  try {
    incoming = await fsp.readdir(from);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  for (const entry of incoming) {
    await fsp.copyFile(path.join(from, entry), path.join(to, entry));
  }
  return incoming.length;
}

async function main() {
  const args = process.argv.slice(2);
  const archive = args.find((a) => !a.startsWith("--"));
  const assumeYes = args.includes("--yes");

  if (!archive) {
    refuse([
      "Give it an archive to restore.",
      "  node scripts/restore.js data/backups/imageforge-20260810-1402.zip",
    ]);
  }

  const dbPath = DB_PATH;
  const uploadDir = UPLOAD_DIR;
  const backupDir = BACKUP_DIR;

  if (!fs.existsSync(archive)) refuse([`There is no ${archive}.`]);

  let manifest;
  try {
    manifest = await readManifest(archive);
  } catch (err) {
    refuse([`Refused: ${err.message}`]);
  }

  if (manifest.version !== ARCHIVE_VERSION) {
    refuse([
      `Refused: that archive is version ${manifest.version} and this code reads version ${ARCHIVE_VERSION}.`,
      manifest.version > ARCHIVE_VERSION
        ? "  It was written by a newer version of Image Forge. Upgrade before restoring it."
        : "  It was written by an older version, whose format this code no longer reads.",
    ]);
  }

  const staging = await fsp.mkdtemp(path.join(os.tmpdir(), "forge-restore-"));
  try {
    let extracted;
    try {
      extracted = await extractTo(archive, staging);
    } catch (err) {
      refuse([`Refused: ${err.message}`]);
    }

    if (!fs.existsSync(extracted.dbPath)) {
      refuse(["Refused: that archive holds no database.sqlite."]);
    }

    const want = wantedSchema();
    const incoming = new Database(extracted.dbPath, { readonly: true });
    const missing = gapsBetween(want, incoming).filter((g) => g.kind === "column");
    const extra = gapsBetween(incoming, want).filter((g) => g.kind === "column");
    incoming.close();
    want.close();

    if (extra.length) {
      refuse([
        "Refused: that archive was written by a newer version of Image Forge.",
        "  It holds columns this code has never heard of:",
        ...extra.map(
          (g) => `    ${g.sql.replace(/^ALTER TABLE /, "").replace(/;$/, "")}`
        ),
        "  Upgrade the app before restoring it.",
      ]);
    }

    if (missing.length) {
      refuse([
        "Refused: that archive predates this version of Image Forge.",
        "  Nothing has been changed. Restore it into an older install, or bring",
        "  the archive forward by unpacking it and running:",
        "",
        ...missing.map((g) => `    ${g.sql}`),
      ]);
    }

    if (!assumeYes) {
      const ok = await confirm(
        `Replace this install with ${path.basename(archive)} ` +
          `(${manifest.counts.generations} images, ${manifest.counts.prompts} prompts)?`
      );
      if (!ok) {
        console.log("Nothing was changed.");
        return;
      }
    }

    const stamp = new Date()
      .toISOString()
      .slice(0, TO_THE_MINUTE)
      .replace(/[-:]/g, "")
      .replace("T", "-");
    const safety = path.join(backupDir, `pre-restore-${stamp}.zip`);
    await writeArchive({ dbPath, uploadDir, outPath: safety });
    console.log(`The state being replaced was saved to ${safety}`);

    const incomingDb = new Database(extracted.dbPath, { readonly: true });
    try {
      await incomingDb.backup(dbPath);
    } finally {
      incomingDb.close();
    }
    for (const suffix of ["-wal", "-shm"]) {
      await fsp.rm(`${dbPath}${suffix}`, { force: true });
    }

    const files = await swapFolder(extracted.uploadDir, uploadDir);

    console.log(`Restored ${path.basename(archive)}`);
    console.log(
      `  ${manifest.counts.prompts} prompts, ${manifest.counts.generations} generations, ` +
        `${files} image${files === 1 ? "" : "s"}`
    );
    console.log(
      "  the API key is not in an archive, so re-enter it in Settings if this is a new machine"
    );
  } finally {
    await fsp.rm(staging, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(`Restore failed: ${err.message}`);
  process.exit(1);
});
