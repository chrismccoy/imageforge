/**
 * Restore script regression tests.
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");
const Database = require("better-sqlite3");
const schema = require("../../../db/schema");

const { writeArchive } = require("../../../utils/files/archive/write");
const { extractTo } = require("../../../utils/files/archive/read");

const RESTORE = path.join(__dirname, "..", "..", "..", "scripts", "restore.js");

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

function anInstall() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "forge-reg-restore-"));
  const dbPath = path.join(root, "imageforge.db");
  const uploadDir = path.join(root, "uploads");
  const backupDir = path.join(root, "backups");
  const tmp = path.join(root, "tmp");
  fs.mkdirSync(uploadDir);
  fs.mkdirSync(backupDir);
  fs.mkdirSync(tmp);

  const db = new Database(dbPath);
  schema.init(db);
  const models = require("../../../models").buildModels(db);
  return { root, dbPath, uploadDir, backupDir, tmp, db, models };
}

function anImage(install, prompt) {
  const filename = `${prompt.replace(/\s/g, "-")}.png`;
  fs.writeFileSync(path.join(install.uploadDir, filename), PNG);
  install.models.Generation.add({
    filename,
    prompt,
    model: "gpt-image-2",
    size: "1024x1024",
  });
}

function done(install) {
  try {
    install.db.close();
  } catch (err) {}
  fs.rmSync(install.root, { recursive: true, force: true });
}

function run(install, args, env = {}) {
  const res = spawnSync(process.execPath, [RESTORE, ...args], {
    encoding: "utf8",
    input: "",
    timeout: 20000,
    env: Object.assign({}, process.env, {
      IMAGEFORGE_DB: install.dbPath,
      IMAGEFORGE_UPLOADS: install.uploadDir,
      IMAGEFORGE_BACKUPS: install.backupDir,
      TMPDIR: install.tmp,
      ...env,
    }),
  });
  return {
    status: res.status,
    out: `${res.stdout}${res.stderr}`,
    stderr: res.stderr.replace(/^◇ .*\n/gm, ""),
  };
}

function snapshot(install) {
  const db = new Database(install.dbPath, { readonly: true });
  const state = {
    generations: db.prepare("SELECT COUNT(*) AS n FROM generations").get().n,
    uploads: fs.readdirSync(install.uploadDir).sort().join(","),
  };
  db.close();
  return state;
}

async function anArchive(install, name = "backup.zip") {
  const archive = path.join(install.root, name);
  await writeArchive({
    dbPath: install.dbPath,
    uploadDir: install.uploadDir,
    outPath: archive,
  });
  return archive;
}

// Rewrite an archive with its entries changed.
async function reworked(install, archive, change) {
  const work = fs.mkdtempSync(path.join(install.root, "work-"));
  await extractTo(archive, work);
  change(work);

  const { ZipArchive } = await import("archiver");
  const out = path.join(install.root, `reworked-${path.basename(work)}.zip`);
  await new Promise((resolve, reject) => {
    const a = new ZipArchive();
    const stream = fs.createWriteStream(out);
    stream.on("close", resolve);
    a.on("error", reject);
    a.pipe(stream);
    a.directory(work, false);
    a.finalize();
  });
  return out;
}

// Medium: restoring onto a fresh machine, with no database yet, works.
test("restore onto a fresh install with no database yet", async () => {
  const install = anInstall();
  try {
    anImage(install, "a cat");
    const archive = await anArchive(install);
    install.db.close();

    const fresh = path.join(install.root, "fresh", "data", "imageforge.db");
    const { status, out } = run(install, [archive, "--yes"], {
      IMAGEFORGE_DB: fresh,
    });
    assert.equal(status, 0, out);
    assert.match(out, /restored/i);
    const back = new Database(fresh, { readonly: true });
    assert.equal(back.prepare("SELECT COUNT(*) AS n FROM generations").get().n, 1);
    back.close();
    assert.deepEqual(fs.readdirSync(install.backupDir), [], "nothing to save");
  } finally {
    done(install);
  }
});

// Medium: nested folders under uploads/ are refused before anything changes.
test("an archive with a folder inside uploads is refused untouched", async () => {
  const install = anInstall();
  try {
    anImage(install, "a cat");
    const archive = await anArchive(install);
    const nested = await reworked(install, archive, (work) => {
      fs.mkdirSync(path.join(work, "uploads", "sub"));
      fs.writeFileSync(path.join(work, "uploads", "sub", "x.png"), PNG);
    });
    anImage(install, "a dog");
    install.db.close();
    const before = snapshot(install);

    const { status, out } = run(install, [nested, "--yes"]);
    assert.notEqual(status, 0);
    assert.match(out, /^Refused: .*folders/m);
    assert.match(out, /uploads\/sub/);
    assert.deepEqual(snapshot(install), before, "nothing was half-restored");
  } finally {
    done(install);
  }
});

// Medium: a database the running app holds open is not overwritten.
test("restore refuses while the app has the database open", async () => {
  const install = anInstall();
  try {
    anImage(install, "a cat");
    const archive = await anArchive(install);
    anImage(install, "a dog");
    install.db.close();
    const before = snapshot(install);

    const app = new Database(install.dbPath);
    app.pragma("journal_mode = WAL");
    app.prepare("SELECT COUNT(*) AS n FROM generations").get();
    let result;
    try {
      result = run(install, [archive, "--yes"]);
    } finally {
      app.close();
    }
    assert.notEqual(result.status, 0);
    assert.match(result.out, /in use.*Stop the app/i);
    assert.deepEqual(snapshot(install), before);
  } finally {
    done(install);
  }
});

// Medium: a refusal still cleans up the staging folder.
test("a refusal leaves no staging folder behind", async () => {
  const install = anInstall();
  try {
    anImage(install, "a cat");
    const archive = await anArchive(install);
    const noDb = await reworked(install, archive, (work) => {
      fs.rmSync(path.join(work, "database.sqlite"));
    });
    install.db.close();

    const { status, stderr } = run(install, [noDb, "--yes"]);
    assert.equal(status, 1);
    assert.equal(stderr, "Refused: that archive holds no database.sqlite.\n");
    assert.deepEqual(fs.readdirSync(install.tmp), [], "staging was removed");
  } finally {
    done(install);
  }
});

// Minor: with no terminal and no --yes, restore says so and changes nothing.
test("without a terminal and without --yes, restore refuses", async () => {
  const install = anInstall();
  try {
    anImage(install, "a cat");
    const archive = await anArchive(install);
    anImage(install, "a dog");
    install.db.close();
    const before = snapshot(install);

    const { status, out } = run(install, [archive]);
    assert.equal(status, 1, out);
    assert.match(out, /--yes/);
    assert.deepEqual(snapshot(install), before);
  } finally {
    done(install);
  }
});

// Minor: a manifest without counts is refused before anything changes.
test("a manifest with no counts is refused untouched", async () => {
  const install = anInstall();
  try {
    anImage(install, "a cat");
    const archive = await anArchive(install);
    const bare = await reworked(install, archive, (work) => {
      fs.writeFileSync(
        path.join(work, "manifest.json"),
        JSON.stringify({ version: 1, app: "imageforge" })
      );
    });
    anImage(install, "a dog");
    install.db.close();
    const before = snapshot(install);

    const { status, out } = run(install, [bare, "--yes"]);
    assert.equal(status, 1);
    assert.match(out, /^Refused: .*manifest/m);
    assert.deepEqual(snapshot(install), before);
  } finally {
    done(install);
  }
});
