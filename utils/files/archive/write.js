/**
 * Writing an archive
 */

"use strict";

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");

const Database = require("better-sqlite3");

const { toExport } = require("../../domain/promptTransfer");
const { createArchive } = require("../zip");

const ARCHIVE_VERSION = 1;

/**
 * Every column in a database, as "table.column type", sorted.
 */
function schemaOf(db) {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((r) => r.name)
    .filter((n) => !n.startsWith("sqlite_"));

  const out = [];
  for (const table of tables) {
    for (const col of db.prepare(`PRAGMA table_info(${table})`).all()) {
      out.push(`${table}.${col.name} ${col.type}`);
    }
  }
  return out.sort();
}

/**
 * Take a consistent copy of the database, with the API key blank.
 */
async function copyDatabaseWithoutKey(source, dbCopy) {
  await source.backup(dbCopy);

  const copy = new Database(dbCopy);
  try {
    copy.prepare("UPDATE settings SET api_key = ''").run();
  } finally {
    copy.close();
  }
}

/**
 * The names of every file in the uploads folder.
 */
async function uploadedFiles(uploadDir) {
  try {
    return (await fsp.readdir(uploadDir, { withFileTypes: true }))
      .filter((e) => e.isFile() && e.name !== ".gitkeep")
      .map((e) => e.name);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    return [];
  }
}

/**
 * What went into the archive, recorded so restore can refuse a bad one.
 */
function buildManifest(source, present) {
  const count = (sql) => source.prepare(sql).get().n;
  const rows = source.prepare("SELECT filename FROM generations").all();
  const have = new Set(present);

  return {
    version: ARCHIVE_VERSION,
    created_at: new Date().toISOString(),
    app: "imageforge",
    counts: {
      prompts: count("SELECT COUNT(*) AS n FROM prompts"),
      generations: count("SELECT COUNT(*) AS n FROM generations"),
      collections: count("SELECT COUNT(*) AS n FROM collections"),
      uploads: present.length,
    },
    missingFiles: rows.filter((r) => !have.has(r.filename)).length,
    schema: schemaOf(source),
  };
}

/**
 * Write the zip itself, resolving once the file is closed.
 */
async function writeZip(tmpZip, entries) {
  const archive = await createArchive();

  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(tmpZip);

    out.on("close", resolve);
    out.on("error", reject);
    archive.on("error", reject);
    archive.pipe(out);

    entries.files.forEach((file) => archive.file(file.from, { name: file.name }));
    entries.text.forEach((entry) =>
      archive.append(entry.body, { name: entry.name })
    );

    archive.finalize();
  });
}

/**
 * Move the finished zip to where it was asked for.
 */
async function moveIntoPlace(tmpZip, outPath) {
  await fsp.mkdir(path.dirname(outPath), { recursive: true });
  try {
    await fsp.rename(tmpZip, outPath);
  } catch (err) {
    if (err.code !== "EXDEV") throw err;
    await fsp.copyFile(tmpZip, outPath);
  }
}

/**
 * Write an archive, returning the manifest it recorded.
 */
async function writeArchive({ dbPath, db, uploadDir, outPath }) {
  const staging = await fsp.mkdtemp(path.join(os.tmpdir(), "forge-backup-"));
  const dbCopy = path.join(staging, "database.sqlite");
  const tmpZip = path.join(staging, "archive.zip");

  const source = db || new Database(dbPath, { readonly: true });

  try {
    await copyDatabaseWithoutKey(source, dbCopy);

    const prompts = source
      .prepare(
        `SELECT p.name, p.prompt, p.rating, p.default_size, p.default_model,
                c.name AS category_name
         FROM prompts p LEFT JOIN categories c ON c.id = p.category_id`
      )
      .all();

    const present = await uploadedFiles(uploadDir);
    const manifest = buildManifest(source, present);

    await writeZip(tmpZip, {
      files: [
        { from: dbCopy, name: "database.sqlite" },
        ...present.map((name) => ({
          from: path.join(uploadDir, name),
          name: `uploads/${name}`,
        })),
      ],
      text: [
        { name: "manifest.json", body: JSON.stringify(manifest, null, 2) },
        {
          name: "prompts.json",
          body: JSON.stringify(toExport(prompts, manifest.created_at), null, 2),
        },
      ],
    });

    await moveIntoPlace(tmpZip, outPath);
    return manifest;
  } finally {
    if (!db) source.close();
    await fsp.rm(staging, { recursive: true, force: true });
  }
}

module.exports = { writeArchive, schemaOf, ARCHIVE_VERSION };
