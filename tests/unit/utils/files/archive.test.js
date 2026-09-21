/**
 * Archive tests
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
const Database = require("better-sqlite3");
const schema = require("../../../../db/schema");

const {
  writeArchive,
  ARCHIVE_VERSION,
} = require("../../../../utils/files/archive/write");

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

function anInstall() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "forge-archive-"));
  const dbPath = path.join(root, "imageforge.db");
  const uploadDir = path.join(root, "uploads");
  fs.mkdirSync(uploadDir);

  const db = new Database(dbPath);
  schema.init(db);
  const models = require("../../../../models").buildModels(db);
  return { root, dbPath, uploadDir, db, models };
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

function entriesIn(zipPath) {
  const yauzl = require("yauzl");
  return new Promise((resolve, reject) => {
    const names = [];
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      zip.on("entry", (entry) => {
        names.push(entry.fileName);
        zip.readEntry();
      });
      zip.on("end", () => resolve(names));
      zip.on("error", reject);
      zip.readEntry();
    });
  });
}

test("an archive holds the database, the uploads, the prompts and a manifest", async () => {
  const install = anInstall();
  try {
    install.models.Prompt.add("Sunsets", "a sunset");
    anImage(install, "a cat");
    anImage(install, "a dog");

    const outPath = path.join(install.root, "backup.zip");
    const manifest = await writeArchive({
      dbPath: install.dbPath,
      uploadDir: install.uploadDir,
      outPath,
    });

    const names = await entriesIn(outPath);
    assert.ok(names.includes("database.sqlite"));
    assert.ok(names.includes("manifest.json"));
    assert.ok(names.includes("prompts.json"));
    assert.ok(names.includes("uploads/a-cat.png"));
    assert.ok(names.includes("uploads/a-dog.png"));

    assert.equal(manifest.version, ARCHIVE_VERSION);
    assert.equal(manifest.counts.prompts, 1);
    assert.equal(manifest.counts.generations, 2);
    assert.equal(manifest.counts.uploads, 2);
  } finally {
    install.db.close();
    fs.rmSync(install.root, { recursive: true, force: true });
  }
});

test("the database inside is a usable SQLite file, not a corrupt copy", async () => {
  const install = anInstall();
  try {
    install.models.Prompt.add("Sunsets", "a sunset");
    anImage(install, "a cat");

    const outPath = path.join(install.root, "backup.zip");
    await writeArchive({
      dbPath: install.dbPath,
      uploadDir: install.uploadDir,
      outPath,
    });

    const extracted = path.join(install.root, "out.sqlite");
    await extractEntry(outPath, "database.sqlite", extracted);

    const copy = new Database(extracted, { readonly: true });
    assert.equal(
      copy.prepare("PRAGMA integrity_check").get().integrity_check,
      "ok"
    );
    assert.equal(copy.prepare("SELECT COUNT(*) AS n FROM prompts").get().n, 1);
    assert.equal(copy.prepare("SELECT COUNT(*) AS n FROM generations").get().n, 1);
    copy.close();
  } finally {
    install.db.close();
    fs.rmSync(install.root, { recursive: true, force: true });
  }
});

test("a row whose file is missing is skipped and counted", async () => {
  const install = anInstall();
  try {
    const id = anImage(install, "a cat");
    fs.unlinkSync(path.join(install.uploadDir, "a-cat.png"));

    const outPath = path.join(install.root, "backup.zip");
    const manifest = await writeArchive({
      dbPath: install.dbPath,
      uploadDir: install.uploadDir,
      outPath,
    });

    assert.equal(manifest.counts.uploads, 0);
    assert.equal(manifest.missingFiles, 1, "reported rather than silently dropped");
    assert.ok(id);
  } finally {
    install.db.close();
    fs.rmSync(install.root, { recursive: true, force: true });
  }
});

test("a file with no database row is archived anyway", async () => {
  const install = anInstall();
  try {
    fs.writeFileSync(path.join(install.uploadDir, "orphan.png"), PNG);

    const outPath = path.join(install.root, "backup.zip");
    const manifest = await writeArchive({
      dbPath: install.dbPath,
      uploadDir: install.uploadDir,
      outPath,
    });

    assert.ok((await entriesIn(outPath)).includes("uploads/orphan.png"));
    assert.equal(manifest.counts.uploads, 1);
  } finally {
    install.db.close();
    fs.rmSync(install.root, { recursive: true, force: true });
  }
});

test("the archive carries no secrets", async () => {
  const install = anInstall();
  try {
    install.models.Settings.update({ api_key: "sk-should-never-appear" });

    const outPath = path.join(install.root, "backup.zip");
    await writeArchive({
      dbPath: install.dbPath,
      uploadDir: install.uploadDir,
      outPath,
    });

    const names = await entriesIn(outPath);
    assert.equal(names.includes(".env"), false, "no .env");
    assert.equal(
      names.some((n) => n.includes("env")),
      false,
      "nothing env-shaped at all"
    );

    const extracted = path.join(install.root, "check.sqlite");
    await extractEntry(outPath, "database.sqlite", extracted);
    const bytes = fs.readFileSync(extracted).toString("latin1");
    assert.equal(
      /sk-[A-Za-z0-9_-]{8,}/.test(bytes),
      false,
      "no key-shaped string sits in the archived database"
    );

    const copy = new Database(extracted, { readonly: true });
    assert.equal(copy.prepare("SELECT api_key FROM settings").get().api_key, "");
    copy.close();

    assert.equal(
      install.models.Settings.get().api_key,
      "sk-should-never-appear",
      "your own install keeps its key"
    );
  } finally {
    install.db.close();
    fs.rmSync(install.root, { recursive: true, force: true });
  }
});

test("the manifest records the schema so restore can check it", async () => {
  const install = anInstall();
  try {
    const outPath = path.join(install.root, "backup.zip");
    const manifest = await writeArchive({
      dbPath: install.dbPath,
      uploadDir: install.uploadDir,
      outPath,
    });

    assert.ok(Array.isArray(manifest.schema));
    assert.ok(
      manifest.schema.some((s) => s.startsWith("generations.deleted_at")),
      "a column restore would need to compare"
    );
  } finally {
    install.db.close();
    fs.rmSync(install.root, { recursive: true, force: true });
  }
});

function extractEntry(zipPath, wanted, outPath) {
  const yauzl = require("yauzl");
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      zip.on("entry", (entry) => {
        if (entry.fileName !== wanted) return zip.readEntry();
        zip.openReadStream(entry, (streamErr, stream) => {
          if (streamErr) return reject(streamErr);
          const out = fs.createWriteStream(outPath);
          stream.pipe(out);
          out.on("close", resolve);
          out.on("error", reject);
        });
      });
      zip.on("end", () => reject(new Error(`${wanted} not in the archive`)));
      zip.on("error", reject);
      zip.readEntry();
    });
  });
}

test("the backup script writes an archive and says what it did", async () => {
  const install = anInstall();
  try {
    anImage(install, "a cat");

    const out = path.join(install.root, "cli.zip");
    const { execFileSync } = require("child_process");
    const stdout = execFileSync(
      process.execPath,
      [
        path.join(__dirname, "..", "..", "..", "..", "scripts", "backup.js"),
        "--out",
        out,
      ],
      {
        encoding: "utf8",
        env: Object.assign({}, process.env, {
          IMAGEFORGE_DB: install.dbPath,
          IMAGEFORGE_UPLOADS: install.uploadDir,
        }),
      }
    );

    assert.ok(fs.existsSync(out), "the archive is where it said");
    assert.match(stdout, /1 image/);
    assert.match(stdout, /cli\.zip/);
    assert.match(stdout, /no \.env/i, "it says what it deliberately left out");
  } finally {
    install.db.close();
    fs.rmSync(install.root, { recursive: true, force: true });
  }
});

test("the script reports rows whose file was missing", async () => {
  const install = anInstall();
  try {
    anImage(install, "a cat");
    fs.unlinkSync(path.join(install.uploadDir, "a-cat.png"));

    const out = path.join(install.root, "cli.zip");
    const { execFileSync } = require("child_process");
    const stdout = execFileSync(
      process.execPath,
      [
        path.join(__dirname, "..", "..", "..", "..", "scripts", "backup.js"),
        "--out",
        out,
      ],
      {
        encoding: "utf8",
        env: Object.assign({}, process.env, {
          IMAGEFORGE_DB: install.dbPath,
          IMAGEFORGE_UPLOADS: install.uploadDir,
        }),
      }
    );

    assert.match(stdout, /1 row/);
  } finally {
    install.db.close();
    fs.rmSync(install.root, { recursive: true, force: true });
  }
});

test("a manifest can be read back out of an archive", async () => {
  const install = anInstall();
  try {
    install.models.Prompt.add("Sunsets", "a sunset");
    const outPath = path.join(install.root, "backup.zip");
    const written = await writeArchive({
      dbPath: install.dbPath,
      uploadDir: install.uploadDir,
      outPath,
    });

    const { readManifest } = require("../../../../utils/files/archive/read");
    assert.deepEqual(await readManifest(outPath), written);
  } finally {
    install.db.close();
    fs.rmSync(install.root, { recursive: true, force: true });
  }
});

test("something that is not an archive is refused in plain words", async () => {
  const { readManifest } = require("../../../../utils/files/archive/read");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "forge-bad-"));
  try {
    const notZip = path.join(root, "notes.txt");
    fs.writeFileSync(notZip, "this is not a zip");
    await assert.rejects(() => readManifest(notZip), /not a zip/i);

    const { ZipArchive } = await import("archiver");
    const bare = path.join(root, "bare.zip");
    await new Promise((resolve, reject) => {
      const a = new ZipArchive();
      const out = fs.createWriteStream(bare);
      out.on("close", resolve);
      a.on("error", reject);
      a.pipe(out);
      a.append("hello", { name: "readme.txt" });
      a.finalize();
    });
    await assert.rejects(() => readManifest(bare), /manifest/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("extracting gives back the database and the uploads", async () => {
  const install = anInstall();
  try {
    anImage(install, "a cat");
    const outPath = path.join(install.root, "backup.zip");
    await writeArchive({
      dbPath: install.dbPath,
      uploadDir: install.uploadDir,
      outPath,
    });

    const { extractTo } = require("../../../../utils/files/archive/read");
    const into = path.join(install.root, "unpacked");
    const { dbPath, uploadDir } = await extractTo(outPath, into);

    const copy = new Database(dbPath, { readonly: true });
    assert.equal(copy.prepare("SELECT COUNT(*) AS n FROM generations").get().n, 1);
    copy.close();
    assert.deepEqual(fs.readdirSync(uploadDir), ["a-cat.png"]);
  } finally {
    install.db.close();
    fs.rmSync(install.root, { recursive: true, force: true });
  }
});

function handMadeZip(outPath, entries) {
  const zlib = require("zlib");
  const locals = [];
  const central = [];
  let offset = 0;

  for (const [name, text] of entries) {
    const nameBytes = Buffer.from(name, "utf8");
    const data = Buffer.from(text, "utf8");
    const crc = zlib.crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); 
    local.writeUInt16LE(20, 4); 
    local.writeUInt16LE(0, 6); 
    local.writeUInt16LE(0, 8); 
    local.writeUInt32LE(0, 10); 
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28); 
    locals.push(local, nameBytes, data);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0); 
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0, 8);
    dir.writeUInt16LE(0, 10);
    dir.writeUInt32LE(0, 12);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(data.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(nameBytes.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, nameBytes);

    offset += local.length + nameBytes.length + data.length;
  }

  const dirBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); 
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dirBytes.length, 12);
  end.writeUInt32LE(offset, 16);

  fs.writeFileSync(outPath, Buffer.concat([...locals, dirBytes, end]));
}

test("an entry that tries to escape the target folder is refused", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "forge-evil-"));
  try {
    const evil = path.join(root, "evil.zip");
    handMadeZip(evil, [
      ["manifest.json", "{}"],
      ["../../escaped.txt", "owned"],
    ]);

    const { extractTo } = require("../../../../utils/files/archive/read");
    await assert.rejects(
      () => extractTo(evil, path.join(root, "into")),
      /outside|invalid relative path/i
    );
    assert.equal(fs.existsSync(path.join(root, "escaped.txt")), false);
    assert.equal(fs.existsSync(path.join(os.tmpdir(), "escaped.txt")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
