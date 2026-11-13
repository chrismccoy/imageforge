/**
 * Database helpers and the secret box.
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const os = require("os");
const Database = require("better-sqlite3");
const session = require("express-session");

const { gapsBetween } = require("../../../db/schemaDiff");
const { openDatabase } = require("../../../db");
const SqliteSessionStore = require("../../../db/sessionStore")(session);
const secretBox = require("../../../utils/security/secretBox");

// Medium: the suggested ALTER keeps NOT NULL DEFAULT, so old rows get the default.
test("a missing NOT NULL DEFAULT column is added with its default", () => {
  const want = new Database(":memory:");
  const live = new Database(":memory:");
  try {
    want.exec(
      "CREATE TABLE t (a TEXT, b INTEGER NOT NULL DEFAULT 0, c TEXT DEFAULT 'x')"
    );
    live.exec("CREATE TABLE t (a TEXT)");
    live.exec("INSERT INTO t (a) VALUES ('old')");

    const sql = gapsBetween(want, live).map((g) => g.sql);
    assert.deepEqual(sql, [
      "ALTER TABLE t ADD COLUMN b INTEGER NOT NULL DEFAULT 0;",
      "ALTER TABLE t ADD COLUMN c TEXT DEFAULT 'x';",
    ]);
    sql.forEach((s) => live.exec(s));
    assert.deepEqual(live.prepare("SELECT * FROM t").get(), {
      a: "old",
      b: 0,
      c: "x",
    });
    assert.deepEqual(
      live
        .prepare("PRAGMA table_info(t)")
        .all()
        .find((c) => c.name === "b").notnull,
      1
    );
  } finally {
    want.close();
    live.close();
  }
});

// Minor: the database's own folder is created, not just DATA_DIR.
test("openDatabase creates the folder its database lives in", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "forge-reg-open-"));
  try {
    const dbPath = path.join(root, "nested", "deeper", "imageforge.db");
    const db = openDatabase(dbPath);
    db.close();
    assert.ok(fs.existsSync(dbPath));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// Minor: a callback that throws is called once, and its error is not fed back to it.
test("a session store callback is called once even when it throws", () => {
  const db = new Database(":memory:");
  require("../../../db/schema").init(db);
  const store = new SqliteSessionStore(db);
  try {
    const sess = { cookie: { maxAge: 60000 } };
    for (const call of [
      (cb) => store.set("sid", sess, cb),
      (cb) => store.get("sid", cb),
      (cb) => store.touch("sid", sess, cb),
      (cb) => store.length(cb),
      (cb) => store.destroy("sid", cb),
      (cb) => store.clear(cb),
    ]) {
      const seen = [];
      assert.throws(
        () =>
          call((err) => {
            seen.push(err);
            throw new Error("thrown by the callback");
          }),
        /thrown by the callback/
      );
      assert.deepEqual(seen, [null]);
    }
  } finally {
    store.close();
    db.close();
  }
});

// Minor: a truncated GCM tag is refused, not accepted with fewer bits.
test("a blob with a truncated tag is refused", () => {
  const key = crypto.randomBytes(32);
  const blob = secretBox.encrypt("", key);
  const raw = Buffer.from(blob.slice(secretBox.PREFIX.length), "base64");
  for (const keep of [12 + 4, 12 + 8, 12 + 15, 5]) {
    const cut = secretBox.PREFIX + raw.subarray(0, keep).toString("base64");
    assert.throws(() => secretBox.decrypt(cut, key), String(keep));
  }
  assert.equal(secretBox.decrypt(blob, key), "");
});
