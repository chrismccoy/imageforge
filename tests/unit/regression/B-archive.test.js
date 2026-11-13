/**
 * Archive regression tests: what a backup holds, and how one is read back.
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
const zlib = require("zlib");
const Database = require("better-sqlite3");
const schema = require("../../../db/schema");

const { writeArchive } = require("../../../utils/files/archive/write");
const { readManifest, extractTo } = require("../../../utils/files/archive/read");

const quiet = { warn() {}, error() {}, log() {} };

function anInstall() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "forge-reg-archive-"));
  const dbPath = path.join(root, "imageforge.db");
  const uploadDir = path.join(root, "uploads");
  fs.mkdirSync(uploadDir);

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  schema.init(db);
  const models = require("../../../models").buildModels(db);
  models.Settings = require("../../../models/settings")(db, { log: quiet });
  return { root, dbPath, uploadDir, db, models };
}

function done(install) {
  try {
    install.db.close();
  } catch (err) {}
  fs.rmSync(install.root, { recursive: true, force: true });
}

async function archivedDbBytes(install) {
  const outPath = path.join(install.root, "backup.zip");
  await writeArchive({
    db: install.db,
    uploadDir: install.uploadDir,
    outPath,
  });
  const { dbPath } = await extractTo(outPath, path.join(install.root, "out"));
  return { dbPath, bytes: fs.readFileSync(dbPath).toString("latin1") };
}

async function zipOf(outPath, entries) {
  const { ZipArchive } = await import("archiver");
  await new Promise((resolve, reject) => {
    const a = new ZipArchive();
    const out = fs.createWriteStream(outPath);
    out.on("close", resolve);
    a.on("error", reject);
    a.pipe(out);
    for (const [name, body] of entries) a.append(body, { name });
    a.finalize();
  });
}

function openFds() {
  return fs.readdirSync("/proc/self/fd").length;
}

// One deflated entry whose header claims more bytes than it inflates to.
function shortEntryZip(outPath, name, text) {
  const nameBytes = Buffer.from(name, "utf8");
  const data = Buffer.from(text, "utf8");
  const packed = zlib.deflateRawSync(data);
  const claimed = data.length + 1000;
  const crc = zlib.crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(claimed, 22);
  local.writeUInt16LE(nameBytes.length, 26);

  const dir = Buffer.alloc(46);
  dir.writeUInt32LE(0x02014b50, 0);
  dir.writeUInt16LE(20, 4);
  dir.writeUInt16LE(20, 6);
  dir.writeUInt16LE(8, 10);
  dir.writeUInt32LE(crc, 16);
  dir.writeUInt32LE(packed.length, 20);
  dir.writeUInt32LE(claimed, 24);
  dir.writeUInt16LE(nameBytes.length, 28);
  dir.writeUInt32LE(0, 42);

  const body = Buffer.concat([local, nameBytes, packed]);
  const central = Buffer.concat([dir, nameBytes]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(body.length, 16);
  fs.writeFileSync(outPath, Buffer.concat([body, central, end]));
}

// S3: the blanked key must not survive in free pages of the copy.
test("a replaced API key leaves no trace in the archived database", async () => {
  const install = anInstall();
  try {
    const older = "sk-proj-OLDER" + "a".repeat(150);
    const current = "sk-proj-CURRENT" + "b".repeat(150);
    install.models.Settings.update({ api_key: older });
    install.models.Settings.update({ api_key: current });

    const { bytes } = await archivedDbBytes(install);
    assert.equal(bytes.includes("CURRENT"), false, "current key is gone");
    assert.equal(bytes.includes("OLDER"), false, "older key is gone");
  } finally {
    done(install);
  }
});

// Medium: sessions are live admin credentials and stay out of a backup.
test("the archived database holds no sessions", async () => {
  const install = anInstall();
  try {
    install.db
      .prepare("INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?)")
      .run(
        "SESSIONID-abcdef123456",
        JSON.stringify({ csrf: "CSRFTOKEN-987" }),
        Date.now() + 60000
      );

    const { dbPath, bytes } = await archivedDbBytes(install);
    const copy = new Database(dbPath, { readonly: true });
    assert.equal(copy.prepare("SELECT COUNT(*) AS n FROM sessions").get().n, 0);
    copy.close();
    assert.equal(bytes.includes("SESSIONID-abcdef"), false);
    assert.equal(bytes.includes("CSRFTOKEN-987"), false);
  } finally {
    done(install);
  }
});

// Minor: the manifest counts what is in the copy, not the live database.
test("manifest counts come from the copied database", async () => {
  const install = anInstall();
  try {
    install.models.Prompt.add("One", "one");
    const original = install.db.backup.bind(install.db);
    install.db.backup = async (dest) => {
      await original(dest);
      install.models.Prompt.add("Two", "added after the copy");
    };

    const manifest = await writeArchive({
      db: install.db,
      uploadDir: install.uploadDir,
      outPath: path.join(install.root, "backup.zip"),
    });
    assert.equal(manifest.counts.prompts, 1);
  } finally {
    done(install);
  }
});

// Medium: an oversized manifest is refused before it is read into memory.
test("a manifest over 1 MB is refused", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "forge-reg-big-"));
  try {
    const big = path.join(root, "big.zip");
    await zipOf(big, [["manifest.json", "{}" + " ".repeat(2 * 1024 * 1024)]]);
    await assert.rejects(() => readManifest(big), /too large/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// Medium: extraction refuses archives past its entry and byte caps.
test("extracting refuses too many entries or too many bytes", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "forge-reg-bomb-"));
  try {
    const many = path.join(root, "many.zip");
    await zipOf(many, [
      ["a.txt", "a"],
      ["b.txt", "b"],
      ["c.txt", "c"],
    ]);
    await assert.rejects(
      () => extractTo(many, path.join(root, "into-many"), { maxEntries: 2 }),
      /entries/i
    );

    const bomb = path.join(root, "bomb.zip");
    await zipOf(bomb, [["zeros.bin", Buffer.alloc(4 * 1024 * 1024)]]);
    await assert.rejects(
      () => extractTo(bomb, path.join(root, "into-bomb"), { maxBytes: 1024 }),
      /more than/i
    );
    assert.equal(
      fs.existsSync(path.join(root, "into-bomb", "zeros.bin")),
      false,
      "nothing was written"
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// Minor: reading the manifest closes the zip file it opened.
test("reading a manifest leaves no file descriptor open", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "forge-reg-fd-"));
  try {
    const zip = path.join(root, "m.zip");
    await zipOf(zip, [
      ["manifest.json", "{}"],
      ["other.txt", "x"],
    ]);
    const before = openFds();
    for (let i = 0; i < 5; i++) await readManifest(zip);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(openFds(), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// Minor: a failed entry write leaves no partial file behind.
test("a failed entry leaves no partial file", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "forge-reg-partial-"));
  try {
    const bad = path.join(root, "bad.zip");
    shortEntryZip(bad, "half.txt", "x".repeat(5000));
    const into = path.join(root, "into");
    await assert.rejects(() => extractTo(bad, into));
    assert.equal(fs.existsSync(path.join(into, "half.txt")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// Minor: an error that is not about the zip format keeps its own message.
test("a missing file is not reported as not a zip", async () => {
  const missing = path.join(os.tmpdir(), `forge-reg-nothing-${process.pid}.zip`);
  await assert.rejects(
    () => readManifest(missing),
    (err) => err.code === "ENOENT" && !/not a zip/i.test(err.message)
  );
});
