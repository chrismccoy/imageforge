/**
 * The share token, in the database
 */

"use strict";

const { freshDb, addGeneration } = require("./setup");

const test = require("node:test");
const assert = require("node:assert/strict");

const buildGeneration = require("../../../models/generation");
const path = require("path");
const schema = require("../../../db/schema");
const { RATE_LIMITS } = require("../../../config/limits");
const { VIEWS } = require("../../../config/views");
const { env } = require("../../../config/env");
const { rateLimit } = require("../../../middleware/rateLimit");

test("a fresh database has the share_token column", () => {
  const db = freshDb();
  const cols = db.prepare("PRAGMA table_info(generations)").all();
  assert.ok(cols.some((c) => c.name === "share_token"));
  db.close();
});

test("init is safe to run twice", () => {
  const db = freshDb();
  schema.init(db);
  const cols = db
    .prepare("PRAGMA table_info(generations)")
    .all()
    .filter((c) => c.name === "share_token");
  assert.equal(cols.length, 1);
  db.close();
});

test("two rows cannot hold the same share token", () => {
  const db = freshDb();
  const insert = db.prepare(
    "INSERT INTO generations (filename, prompt, created_at, share_token) VALUES (?, '', '2026-01-01', ?)"
  );
  insert.run("a.png", "aaaa");
  assert.throws(() => insert.run("b.png", "aaaa"), /UNIQUE/);
  db.close();
});

test("many rows may hold a null share token", () => {
  const db = freshDb();
  const insert = db.prepare(
    "INSERT INTO generations (filename, prompt, created_at) VALUES (?, '', '2026-01-01')"
  );
  insert.run("a.png");
  insert.run("b.png");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM generations").get().n, 2);
  db.close();
});

test("a generation round-trips a share token", () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const id = addGeneration(Generation, "one.png", "a cat");

  assert.equal(Generation.get(id).share_token, null);

  Generation.setShareToken(id, "tok-one");
  assert.equal(Generation.get(id).share_token, "tok-one");

  const found = Generation.getByShareToken("tok-one");
  assert.equal(found.id, id);
  assert.equal(found.filename, "one.png");

  Generation.clearShareToken(id);
  assert.equal(Generation.get(id).share_token, null);
  assert.equal(Generation.getByShareToken("tok-one"), null);
  db.close();
});

test("an unknown share token finds nothing", () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  assert.equal(Generation.getByShareToken("nope"), null);
  db.close();
});

test("the public share flag is off unless the environment turns it on", () => {
  assert.equal(typeof env.PUBLIC_SHARE, "boolean");
  assert.equal(env.PUBLIC_SHARE, false);
});

test("the share routes have their own rate limit", () => {
  assert.equal(RATE_LIMITS.share.windowMs, 60 * 1000);
  assert.equal(RATE_LIMITS.share.max, 60);
});

test("the share views are named in the view table", () => {
  assert.equal(VIEWS.SHARE, "share");
  assert.equal(VIEWS.SHARE_NOTFOUND, "share-notfound");
});

function limiterRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    send(body) {
      this.body = body;
      return this;
    },
  };
}

test("the rate limiter uses a supplied html reply instead of rendering login", () => {
  const limiter = rateLimit({
    windowMs: 1000,
    max: 1,
    message: "Slow down.",
    html: (res, message) => res.status(429).send(message),
  });
  const req = { ip: "9.9.9.9", path: "/s/abc", method: "GET" };

  let passed = 0;
  limiter(req, limiterRes(), () => {
    passed += 1;
  });
  assert.equal(passed, 1);

  const blocked = limiterRes();
  limiter(req, blocked, () => {
    passed += 1;
  });
  assert.equal(passed, 1);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.body, "Slow down.");
  assert.ok(blocked.headers["Retry-After"]);
});

test("list queries carry the share token", () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const id = addGeneration(Generation, "one.png", "a cat");
  Generation.setShareToken(id, "tok-one");

  assert.equal(Generation.all()[0].share_token, "tok-one");
  assert.equal(Generation.page({ limit: 10, offset: 0 })[0].share_token, "tok-one");
  db.close();
});
