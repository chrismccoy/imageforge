/**
 * Edit endpoint tests
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";
process.env.OPENAI_API_KEY = "test-key";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const Database = require("better-sqlite3");
const schema = require("../../db/schema");
const { uploadPath } = require("../../utils/files/uploads");

const openai = require("../../services/openai");

const savedFiles = [];

test.after(() => {
  for (const full of savedFiles) {
    try {
      fs.unlinkSync(full);
    } catch (_err) {
    }
  }
});

let sent = null;
const EDITED = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
openai.editImage = async (options) => {
  sent = options;
  return {
    model: "gpt-image-2",
    bytes: EDITED,
    usage: { total: 100 },
    durationMs: 5300,
    dataUrl: `data:image/png;base64,${EDITED.toString("base64")}`,
  };
};

const { createApp } = require("../../server");
const { UPLOAD_DIR } = require("../../config/paths");

function png(width, height) {
  const buf = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(20),
]);

function freshDb() {
  const db = new Database(":memory:");
  schema.init(db);
  return db;
}

function models(db) {
  return require("../../models").buildModels(db);
}

function anImage(db, prompt) {
  return Number(
    models(db).Generation.add({
      filename: `${process.pid}-${prompt.replace(/\s/g, "-")}.png`,
      prompt,
      model: "gpt-image-2",
      size: "1024x1024",
    })
  );
}

async function startApp(db) {
  const app = createApp({ db });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    stop: () => server.close(),
  };
}

function cookieFrom(res) {
  const set = res.headers.getSetCookie();
  return set && set.length ? set.map((c) => c.split(";")[0]).join("; ") : null;
}

async function signIn(base) {
  const page = await fetch(`${base}/login`);
  const csrf = /name="_csrf" value="([^"]+)"/.exec(await page.text())[1];
  const cookie = cookieFrom(page);
  const res = await fetch(`${base}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie },
    body: `_csrf=${csrf}&username=admin&password=test-pass`,
    redirect: "manual",
  });
  const live = cookieFrom(res) || cookie;
  const html = await (
    await fetch(`${base}/settings`, { headers: { cookie: live } })
  ).text();
  return { cookie: live, csrf: /name="_csrf" value="([^"]+)"/.exec(html)[1] };
}

function postEdit(app, auth, parts = {}) {
  const body = new FormData();
  body.append("_csrf", auth.csrf);
  body.append("prompt", parts.prompt === undefined ? "a red hat" : parts.prompt);
  body.append("model", "2");
  body.append("size", "1024x1024");
  if (parts.source_id !== null) {
    body.append("source_id", String(parts.source_id));
  }
  if (parts.image !== null) {
    body.append("image", new Blob([parts.image || png(1024, 1024)]), "source.png");
  }
  if (parts.mask !== null) {
    body.append("mask", new Blob([parts.mask || png(1024, 1024)]), "mask.png");
  }
  return fetch(`${app.base}/api/edit`, {
    method: "POST",
    headers: { cookie: auth.cookie },
    body,
  });
}

test("an edit comes back as a token and a preview", async () => {
  const db = freshDb();
  const id = anImage(db, "a cat");
  const app = await startApp(db);
  try {
    const auth = await signIn(app.base);
    const res = await postEdit(app, auth, { source_id: id });
    const data = await res.json();

    assert.equal(res.status, 200);
    assert.ok(data.token, "a claim token");
    assert.match(data.url, /^data:image\/png;base64,/);
    assert.equal(sent.prompt, "a red hat", "the prompt went on");
    assert.ok(sent.imageBytes.length && sent.maskBytes.length);
  } finally {
    app.stop();
    db.close();
  }
});

test("saving it records what it was edited from", async () => {
  const db = freshDb();
  const id = anImage(db, "a cat");
  const app = await startApp(db);
  try {
    const auth = await signIn(app.base);
    const { token } = await (await postEdit(app, auth, { source_id: id })).json();

    const res = await fetch(`${app.base}/api/save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: auth.cookie,
        "X-CSRF-Token": auth.csrf,
      },
      body: JSON.stringify({ token }),
    });
    assert.equal(res.status, 200);
    savedFiles.push(
      uploadPath((await res.json()).url.replace("/uploads/", ""), UPLOAD_DIR).full
    );

    const rows = db
      .prepare("SELECT * FROM generations WHERE edited_from IS NOT NULL")
      .all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].edited_from, id);
  } finally {
    app.stop();
    db.close();
  }
});

test("saving an edit records how long it took", async () => {
  const db = freshDb();
  const id = anImage(db, "a cat");
  const app = await startApp(db);
  try {
    const auth = await signIn(app.base);
    const { token } = await (await postEdit(app, auth, { source_id: id })).json();

    const res = await fetch(`${app.base}/api/save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: auth.cookie,
        "X-CSRF-Token": auth.csrf,
      },
      body: JSON.stringify({ token }),
    });
    assert.equal(res.status, 200);
    savedFiles.push(
      uploadPath((await res.json()).url.replace("/uploads/", ""), UPLOAD_DIR).full
    );

    const row = db
      .prepare("SELECT duration_ms FROM generations WHERE edited_from = ?")
      .get(id);
    assert.equal(row.duration_ms, 5300);
  } finally {
    app.stop();
    db.close();
  }
});

test("a mask of the wrong size is refused before the API is called", async () => {
  const db = freshDb();
  const id = anImage(db, "a cat");
  const app = await startApp(db);
  try {
    const auth = await signIn(app.base);
    sent = null;
    const res = await postEdit(app, auth, {
      source_id: id,
      mask: png(512, 512),
    });
    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /same size/i);
    assert.equal(sent, null, "nothing was sent upstream");
  } finally {
    app.stop();
    db.close();
  }
});

test("something that is not a PNG is refused", async () => {
  const db = freshDb();
  const id = anImage(db, "a cat");
  const app = await startApp(db);
  try {
    const auth = await signIn(app.base);
    sent = null;
    const res = await postEdit(app, auth, { source_id: id, mask: JPEG });
    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /PNG/);
    assert.equal(sent, null);
  } finally {
    app.stop();
    db.close();
  }
});

test("an empty prompt is refused", async () => {
  const db = freshDb();
  const id = anImage(db, "a cat");
  const app = await startApp(db);
  try {
    const auth = await signIn(app.base);
    sent = null;
    const res = await postEdit(app, auth, { source_id: id, prompt: "  " });
    assert.equal(res.status, 400);
    assert.equal(sent, null);
  } finally {
    app.stop();
    db.close();
  }
});

test("editing an image that is not there is refused", async () => {
  const db = freshDb();
  const app = await startApp(db);
  try {
    const auth = await signIn(app.base);
    sent = null;
    const res = await postEdit(app, auth, { source_id: 9999 });
    assert.equal(res.status, 404);
    assert.equal(sent, null);
  } finally {
    app.stop();
    db.close();
  }
});

test("editing a trashed image is refused", async () => {
  const db = freshDb();
  const id = anImage(db, "a cat");
  models(db).Generation.trash(id);
  const app = await startApp(db);
  try {
    const auth = await signIn(app.base);
    sent = null;
    const res = await postEdit(app, auth, { source_id: id });
    assert.equal(res.status, 404);
    assert.equal(sent, null);
  } finally {
    app.stop();
    db.close();
  }
});

test("a request with no CSRF token is refused", async () => {
  const db = freshDb();
  const id = anImage(db, "a cat");
  const app = await startApp(db);
  try {
    const auth = await signIn(app.base);
    sent = null;
    const body = new FormData();
    body.append("prompt", "a red hat");
    body.append("source_id", String(id));
    body.append("image", new Blob([png(1024, 1024)]), "source.png");
    body.append("mask", new Blob([png(1024, 1024)]), "mask.png");

    const res = await fetch(`${app.base}/api/edit`, {
      method: "POST",
      headers: { cookie: auth.cookie },
      body,
    });
    assert.equal(res.status, 403);
    assert.equal(sent, null);
  } finally {
    app.stop();
    db.close();
  }
});
