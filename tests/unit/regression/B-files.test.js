/**
 * Backup listing, backup names, upload paths and zip downloads.
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const Database = require("better-sqlite3");
const schema = require("../../../db/schema");

const { listBackups } = require("../../../utils/files/backups");
const { uploadPath } = require("../../../utils/files/uploads");
const { sendZip } = require("../../../utils/files/zip");
const backupController = require("../../../controllers/backupController");

function scratch(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `forge-reg-${label}-`));
}

// Minor: a folder named *.zip is not a backup.
test("listBackups lists files only", () => {
  const dir = scratch("list");
  try {
    fs.writeFileSync(path.join(dir, "real.zip"), "zip");
    fs.mkdirSync(path.join(dir, "folder.zip"));
    assert.deepEqual(
      listBackups(dir).map((b) => b.name),
      ["real.zip"]
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Minor: a backup deleted while the folder is listed is skipped, not a 500.
test("listBackups skips a file that vanished mid-listing", (t) => {
  const dir = scratch("vanish");
  try {
    fs.writeFileSync(path.join(dir, "kept.zip"), "zip");
    fs.writeFileSync(path.join(dir, "gone.zip"), "zip");
    const real = fs.statSync;
    t.mock.method(fs, "statSync", (p, ...rest) => {
      if (path.basename(String(p)) === "gone.zip") {
        throw Object.assign(new Error("ENOENT: gone"), { code: "ENOENT" });
      }
      return real(p, ...rest);
    });
    assert.deepEqual(
      listBackups(dir).map((b) => b.name),
      ["kept.zip"]
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Minor: two backups taken in the same second both survive.
test("two backups in the same second do not overwrite each other", async (t) => {
  const root = scratch("same-second");
  const db = new Database(":memory:");
  try {
    schema.init(db);
    const backupDir = path.join(root, "backups");
    const uploadDir = path.join(root, "uploads");
    fs.mkdirSync(uploadDir);

    // A fixed clock, without the experimental MockTimers API.
    const RealDate = Date;
    const now = RealDate.UTC(2026, 0, 2, 3, 4, 5);
    global.Date = class extends RealDate {
      constructor(...args) {
        super(...(args.length ? args : [now]));
      }
      static now() {
        return now;
      }
    };
    t.after(() => {
      global.Date = RealDate;
    });
    const ctrl = backupController({ db, folders: { backupDir, uploadDir } });
    const res = { redirect() {} };
    const next = (err) => {
      throw err;
    };
    await ctrl.create({}, res, next);
    await ctrl.create({}, res, next);
    global.Date = RealDate;

    const names = fs.readdirSync(backupDir).sort();
    assert.equal(names.length, 2, names.join(","));
    assert.ok(names.includes("imageforge-20260102-030405.zip"));
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// Minor: "", "." and ".." name no file and are refused.
test("uploadPath refuses names that are no file", () => {
  for (const bad of ["", ".", "..", "a/..", null]) {
    assert.throws(
      () => uploadPath(bad, "/srv/uploads"),
      (err) => err.status === 404,
      String(bad)
    );
  }
  assert.deepEqual(uploadPath("../x.png", "/srv/uploads"), {
    safe: "x.png",
    full: path.join("/srv/uploads", "x.png"),
  });
});

// Minor: a zip that fails before any data is a plain 500, not an attachment.
test("a zip that fails at once returns a plain 500", async () => {
  const server = http.createServer((req, res) => {
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    sendZip(res, [{ full: undefined, name: "x.png" }], "x.zip", {
      log: { error() {} },
    });
  });
  server.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/`);
    await res.arrayBuffer();
    assert.equal(res.status, 500);
    assert.equal(res.headers.get("content-disposition"), null);
    assert.notEqual(res.headers.get("content-type"), "application/zip");
  } finally {
    server.close();
  }
});
