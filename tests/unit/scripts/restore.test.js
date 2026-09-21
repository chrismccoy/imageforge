/**
 * Restore tests
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const Database = require("better-sqlite3");
const schema = require("../../../db/schema");

const { writeArchive } = require("../../../utils/files/archive/write");

const RESTORE = path.join(__dirname, "..", "..", "..", "scripts", "restore.js");

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

function anInstall() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "forge-restore-"));
  const dbPath = path.join(root, "imageforge.db");
  const uploadDir = path.join(root, "uploads");
  const backupDir = path.join(root, "backups");
  fs.mkdirSync(uploadDir);
  fs.mkdirSync(backupDir);

  const db = new Database(dbPath);
  schema.init(db);
  const models = require("../../../models").buildModels(db);
  return { root, dbPath, uploadDir, backupDir, db, models };
}

function anImage(install, prompt) {
  const filename = `${prompt.replace(/\s/g, "-")}.png`;
  fs.writeFileSync(path.join(install.uploadDir, filename), PNG);
  return Number(
    install.models.Generation.add({
      filename,
      prompt,
      model: "gpt-image-2",
      size: "1024x1024",
    })
  );
}

function restore(install, archive, extra = []) {
  return execFileSync(process.execPath, [RESTORE, archive, "--yes", ...extra], {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    env: Object.assign({}, process.env, {
      IMAGEFORGE_DB: install.dbPath,
      IMAGEFORGE_UPLOADS: install.uploadDir,
      IMAGEFORGE_BACKUPS: install.backupDir,
    }),
  });
}

function snapshot(install) {
  const db = new Database(install.dbPath, { readonly: true });
  const state = {
    prompts: db.prepare("SELECT COUNT(*) AS n FROM prompts").get().n,
    generations: db.prepare("SELECT COUNT(*) AS n FROM generations").get().n,
    uploads: fs.readdirSync(install.uploadDir).sort().join(","),
  };
  db.close();
  return state;
}

function refuses(install, archive) {
  try {
    restore(install, archive);
    return null;
  } catch (err) {
    return String(err.stderr || "") + String(err.stdout || "");
  }
}

test("restoring puts back exactly what was archived", async () => {
  const install = anInstall();
  try {
    install.models.Prompt.add("Sunsets", "a sunset");
    anImage(install, "a cat");
    anImage(install, "a dog");

    const archive = path.join(install.root, "backup.zip");
    await writeArchive({
      dbPath: install.dbPath,
      uploadDir: install.uploadDir,
      outPath: archive,
    });

    install.models.Prompt.remove(install.models.Prompt.all()[0].id);
    install.db.prepare("DELETE FROM generations").run();
    fs.rmSync(path.join(install.uploadDir, "a-cat.png"));
    install.db.close();

    const out = restore(install, archive);
    assert.match(out, /restored/i);

    const back = new Database(install.dbPath, { readonly: true });
    assert.equal(back.prepare("SELECT COUNT(*) AS n FROM prompts").get().n, 1);
    assert.equal(back.prepare("SELECT COUNT(*) AS n FROM generations").get().n, 2);
    back.close();
    assert.deepEqual(fs.readdirSync(install.uploadDir).sort(), [
      "a-cat.png",
      "a-dog.png",
    ]);
  } finally {
    try {
      install.db.close();
    } catch (err) {
    }
    fs.rmSync(install.root, { recursive: true, force: true });
  }
});

test("a share token survives a restore, so links already sent still work", async () => {
  const install = anInstall();
  try {
    const id = anImage(install, "a cat");
    install.models.Generation.share(id, () => "KEEPTHISTK");

    const archive = path.join(install.root, "backup.zip");
    await writeArchive({
      dbPath: install.dbPath,
      uploadDir: install.uploadDir,
      outPath: archive,
    });

    install.db.prepare("UPDATE generations SET share_token = NULL").run();
    install.db.close();

    restore(install, archive);

    const back = new Database(install.dbPath, { readonly: true });
    assert.equal(
      back.prepare("SELECT share_token FROM generations WHERE id = ?").get(id)
        .share_token,
      "KEEPTHISTK"
    );
    back.close();
  } finally {
    try {
      install.db.close();
    } catch (err) {
    }
    fs.rmSync(install.root, { recursive: true, force: true });
  }
});

test("restore saves the current state before replacing it", async () => {
  const install = anInstall();
  try {
    anImage(install, "the original");

    const archive = path.join(install.root, "backup.zip");
    await writeArchive({
      dbPath: install.dbPath,
      uploadDir: install.uploadDir,
      outPath: archive,
    });

    anImage(install, "added after the backup");
    install.db.close();

    const out = restore(install, archive);

    const saved = fs
      .readdirSync(install.backupDir)
      .filter((f) => f.endsWith(".zip"));
    assert.equal(saved.length, 1, "a pre-restore archive was written");
    assert.match(out, /pre-restore/i);

    const { extractTo } = require("../../../utils/files/archive/read");
    const into = path.join(install.root, "check");
    const { dbPath } = await extractTo(
      path.join(install.backupDir, saved[0]),
      into
    );
    const before = new Database(dbPath, { readonly: true });
    assert.equal(
      before.prepare("SELECT COUNT(*) AS n FROM generations").get().n,
      2,
      "including what the restore was about to discard"
    );
    before.close();
  } finally {
    try {
      install.db.close();
    } catch (err) {
    }
    fs.rmSync(install.root, { recursive: true, force: true });
  }
});

test("something that is not an archive is refused, and nothing is touched", async () => {
  const install = anInstall();
  try {
    anImage(install, "a cat");
    install.db.close();
    const before = snapshot(install);

    const notZip = path.join(install.root, "notes.txt");
    fs.writeFileSync(notZip, "not a zip at all");

    const message = refuses(install, notZip);
    assert.ok(message, "it refused");
    assert.match(message, /not a zip/i);
    assert.deepEqual(snapshot(install), before, "nothing changed");
  } finally {
    try {
      install.db.close();
    } catch (err) {
    }
    fs.rmSync(install.root, { recursive: true, force: true });
  }
});

test("an archive missing a column this code needs is refused", async () => {
  const install = anInstall();
  try {
    anImage(install, "a cat");

    const archive = path.join(install.root, "old.zip");
    await writeArchive({
      dbPath: install.dbPath,
      uploadDir: install.uploadDir,
      outPath: archive,
    });

    const aged = await agedArchive(install, archive, (db) => {
      db.exec("DROP VIEW IF EXISTS live_generations");
      db.exec("ALTER TABLE generations DROP COLUMN deleted_at");
    });

    install.db.close();
    const before = snapshot(install);

    const message = refuses(install, aged);
    assert.ok(message, "it refused");
    assert.match(message, /deleted_at/, "and named the statement to run");
    assert.deepEqual(snapshot(install), before, "nothing was half-restored");
  } finally {
    try {
      install.db.close();
    } catch (err) {
    }
    fs.rmSync(install.root, { recursive: true, force: true });
  }
});

test("an archive from a newer version is refused", async () => {
  const install = anInstall();
  try {
    anImage(install, "a cat");

    const archive = path.join(install.root, "future.zip");
    await writeArchive({
      dbPath: install.dbPath,
      uploadDir: install.uploadDir,
      outPath: archive,
    });

    const future = await agedArchive(install, archive, (db) => {
      db.exec("ALTER TABLE generations ADD COLUMN invented_later TEXT");
    });

    install.db.close();
    const before = snapshot(install);

    const message = refuses(install, future);
    assert.ok(message, "it refused");
    assert.match(message, /newer|later/i);
    assert.deepEqual(snapshot(install), before);
  } finally {
    try {
      install.db.close();
    } catch (err) {
    }
    fs.rmSync(install.root, { recursive: true, force: true });
  }
});

async function agedArchive(install, archive, change) {
  const { extractTo } = require("../../../utils/files/archive/read");
  const work = path.join(install.root, `aged-${Math.abs(archive.length)}`);
  const { dbPath, uploadDir } = await extractTo(archive, work);

  const db = new Database(dbPath);
  change(db);
  db.close();

  const out = path.join(install.root, `aged-${path.basename(archive)}`);
  await writeArchive({ dbPath, uploadDir, outPath: out });
  return out;
}
