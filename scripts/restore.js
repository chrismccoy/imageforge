/**
 * Restore
 *
 * Puts an archive back: the database and the uploads. Stop the app first.
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
const { BACKUP_DIR, unusedPath } = require("../utils/files/backups");
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
 * A refusal, carrying the lines that say why.
 */
class Refusal extends Error {
  constructor(lines) {
    super(lines.join("\n"));
    this.lines = lines;
  }
}

/**
 * Stop, saying why, without having touched anything.
 */
function refuse(lines) {
  throw new Refusal(lines);
}

/**
 * Ask before replacing, unless --yes was given. No answer means no.
 */
function confirm(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    let answered = false;
    rl.on("close", () => {
      if (!answered) resolve(false);
    });
    rl.question(`${question} [y/N] `, (answer) => {
      answered = true;
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

/**
 * Whether a manifest has the fields restore reads.
 */
function wellFormed(manifest) {
  const counts = manifest && manifest.counts;
  return Boolean(
    counts &&
    typeof counts === "object" &&
    Number.isInteger(counts.prompts) &&
    Number.isInteger(counts.generations)
  );
}

/**
 * The entries of the unpacked uploads folder that are not plain files.
 */
async function nestedUploads(dir) {
  try {
    return (await fsp.readdir(dir, { withFileTypes: true }))
      .filter((e) => !e.isFile())
      .map((e) => e.name);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    return [];
  }
}

/**
 * Whether another connection, such as the running app, has the database open.
 */
function inUse(dbPath) {
  if (!fs.existsSync(dbPath)) return false;
  const probe = new Database(dbPath, { timeout: 200 });
  try {
    probe.pragma("locking_mode = EXCLUSIVE");
    probe.exec("BEGIN EXCLUSIVE");
    probe.exec("ROLLBACK");
    return false;
  } catch (err) {
    if (err.code === "SQLITE_BUSY" || err.code === "SQLITE_LOCKED") return true;
    throw err;
  } finally {
    probe.close();
  }
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

  if (!manifest || typeof manifest !== "object") {
    refuse([`Refused: the manifest in ${path.basename(archive)} is not readable.`]);
  }

  if (manifest.version !== ARCHIVE_VERSION) {
    refuse([
      `Refused: that archive is version ${manifest.version} and this code reads version ${ARCHIVE_VERSION}.`,
      manifest.version > ARCHIVE_VERSION
        ? "  It was written by a newer version of Image Forge. Upgrade before restoring it."
        : "  It was written by an older version, whose format this code no longer reads.",
    ]);
  }

  if (!wellFormed(manifest)) {
    refuse([
      `Refused: the manifest in ${path.basename(archive)} has no counts, so Image Forge did not write it.`,
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

    const nested = await nestedUploads(extracted.uploadDir);
    if (nested.length) {
      refuse([
        "Refused: that archive's uploads folder holds folders, which an archive never has:",
        ...nested.map((name) => `    uploads/${name}`),
      ]);
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

    if (inUse(dbPath)) {
      refuse([
        `Refused: ${dbPath} is in use. Stop the app, then run the restore again.`,
      ]);
    }

    if (!assumeYes) {
      if (!process.stdin.isTTY) {
        refuse([
          "Refused: there is no terminal to confirm on. Run it again with --yes to replace this install.",
        ]);
      }
      const ok = await confirm(
        `With the app stopped, replace this install with ${path.basename(archive)} ` +
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
    if (fs.existsSync(dbPath)) {
      const safety = unusedPath(backupDir, `pre-restore-${stamp}.zip`);
      await writeArchive({ dbPath, uploadDir, outPath: safety, overwrite: false });
      console.log(`The state being replaced was saved to ${safety}`);
    }

    await fsp.mkdir(path.dirname(dbPath), { recursive: true });
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
  if (err instanceof Refusal) console.error(err.lines.join("\n"));
  else console.error(`Restore failed: ${err.message}`);
  process.exitCode = 1;
});
