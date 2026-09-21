/**
 * Upload feature tests
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const Database = require("better-sqlite3");

const schema = require("../../db/schema");
const { uploadPath } = require("../../utils/files/uploads");
const { sniffImageType } = require("../../utils/files/imageType");
const buildController = require("../../controllers/uploadController");
const { createUploadsUsage } = require("../../services/uploadsUsage");
const { createApp } = require("../../server");
const { UPLOAD_DIR } = require("../../config/paths");
const { resolveLimits } = require("../../config/limits");

function imageBuf(kind) {
  const b = Buffer.alloc(64, 0x20);
  if (kind === "png") [0x89, 0x50, 0x4e, 0x47].forEach((v, i) => (b[i] = v));
  if (kind === "jpg") [0xff, 0xd8, 0xff].forEach((v, i) => (b[i] = v));
  if (kind === "webp") {
    b.write("RIFF", 0, "ascii");
    b.write("WEBP", 8, "ascii");
  }
  return b;
}

function freshDb() {
  const db = new Database(":memory:");
  schema.init(db);
  return db;
}

function setup({ quotaBytes, ...opts } = {}) {
  const db = freshDb();
  const Prompt = require("../../models/prompt")(db);
  const Generation = require("../../models/generation")(db);
  const Settings = require("../../models/settings")(db);
  const ctrl = buildController({
    models: { Prompt, Generation, Settings },
    usage: createUploadsUsage(quotaBytes === undefined ? {} : { quotaBytes }),
    limits: resolveLimits(),
    ...opts,
  });
  return { db, Prompt, Generation, Settings, ctrl };
}

function fakeReq({ file, files, body, csrf = "tok", sessionCsrf = "tok" }) {
  return {
    files: files || (file ? [file] : []),
    body: { _csrf: csrf, ...body },
    session: { csrfToken: sessionCsrf },
    get() {
      return "";
    },
  };
}

function fakeRes() {
  return {
    statusCode: 200,
    rendered: null,
    redirectedTo: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    render(view, data) {
      this.rendered = { view, data };
      return this;
    },
    redirect(to) {
      this.redirectedTo = to;
      return this;
    },
  };
}

const savedFiles = [];
test.after(() => {
  for (const full of savedFiles) {
    try {
      fs.unlinkSync(full);
    } catch (_err) {
    }
  }
});

test("sniffImageType recognizes png, jpeg, webp and rejects others", () => {
  assert.equal(sniffImageType(imageBuf("png")).ext, "png");
  assert.equal(sniffImageType(imageBuf("jpg")).ext, "jpg");
  assert.equal(sniffImageType(imageBuf("webp")).ext, "webp");
  assert.equal(sniffImageType(Buffer.alloc(64, 0)), null);
  assert.equal(sniffImageType(Buffer.from("hi")), null);
});

test("upload assigns a chosen prompt and stores the image", async () => {
  const { Prompt, Generation, ctrl } = setup();
  const pid = Prompt.add("Sky", "a blue sky");

  const res = fakeRes();
  await ctrl.create(
    fakeReq({
      file: { buffer: imageBuf("png"), size: 64 },
      body: { prompt_id: String(pid), size: "1536x1024" },
    }),
    res
  );

  assert.equal(res.redirectedTo, "/generations");
  const rows = Generation.all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].prompt, "a blue sky");
  assert.equal(Generation.get(rows[0].id).prompt_id, pid);
  assert.equal(rows[0].size, "1536x1024");
  assert.equal(rows[0].model, "gpt-image-1.5");
  assert.match(rows[0].filename, /\.png$/);

  const { full } = uploadPath(rows[0].filename, UPLOAD_DIR);
  savedFiles.push(full);
  assert.ok(fs.existsSync(full), "the uploaded file should be on disk");
});

test("upload keeps a typed prompt when none is chosen and honors the file type", async () => {
  const { Generation, ctrl } = setup();

  const res = fakeRes();
  await ctrl.create(
    fakeReq({
      file: { buffer: imageBuf("jpg"), size: 64 },
      body: { prompt: "a typed prompt", size: "1024x1024" },
    }),
    res
  );

  assert.equal(res.redirectedTo, "/generations");
  const rows = Generation.all();
  assert.equal(rows[0].prompt, "a typed prompt");
  assert.equal(Generation.get(rows[0].id).prompt_id, null);
  assert.match(rows[0].filename, /\.jpg$/);
  savedFiles.push(uploadPath(rows[0].filename, UPLOAD_DIR).full);
});

test("upload rejects a file that is not a known image", async () => {
  const { Generation, ctrl } = setup();

  const res = fakeRes();
  await ctrl.create(
    fakeReq({
      file: { buffer: Buffer.alloc(64, 0), size: 64 },
      body: { prompt: "x" },
    }),
    res
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.rendered.data.error, /PNG, JPEG, or WebP/);
  assert.equal(Generation.all().length, 0);
});

test("upload with no file shows an error", async () => {
  const { Generation, ctrl } = setup();

  const res = fakeRes();
  await ctrl.create(fakeReq({ file: undefined, body: {} }), res);

  assert.equal(res.statusCode, 400);
  assert.match(res.rendered.data.error, /Choose an image/);
  assert.equal(Generation.all().length, 0);
});

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
  const loginCsrf = /name="_csrf" value="([^"]+)"/.exec(await page.text())[1];
  const loginCookie = cookieFrom(page);

  const res = await fetch(`${base}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      cookie: loginCookie,
    },
    body: `_csrf=${loginCsrf}&username=admin&password=test-pass`,
    redirect: "manual",
  });
  return cookieFrom(res) || loginCookie;
}

test("upload without a valid CSRF token is denied and writes nothing", async () => {
  const db = freshDb();
  const Generation = require("../../models/generation")(db);
  const app = await startApp(db);

  try {
    const cookie = await signIn(app.base);

    const form = new FormData();
    form.set("_csrf", "WRONG");
    form.set("size", "1024x1024");
    form.set("image", new Blob([imageBuf("png")], { type: "image/png" }), "x.png");

    const res = await fetch(`${app.base}/upload`, {
      method: "POST",
      headers: { cookie },
      body: form,
      redirect: "manual",
    });

    assert.equal(res.status, 403);
    assert.equal(Generation.all().length, 0);
  } finally {
    app.stop();
    db.close();
  }
});

test("upload with no CSRF token at all is denied", async () => {
  const db = freshDb();
  const Generation = require("../../models/generation")(db);
  const app = await startApp(db);

  try {
    const cookie = await signIn(app.base);

    const form = new FormData();
    form.set("size", "1024x1024");
    form.set("image", new Blob([imageBuf("png")], { type: "image/png" }), "x.png");

    const res = await fetch(`${app.base}/upload`, {
      method: "POST",
      headers: { cookie },
      body: form,
      redirect: "manual",
    });

    assert.equal(res.status, 403);
    assert.equal(Generation.all().length, 0);
  } finally {
    app.stop();
    db.close();
  }
});

test("upload is blocked when the quota is full", async () => {
  const { Generation, ctrl } = setup({ quotaBytes: 0 });

  const res = fakeRes();
  await ctrl.create(
    fakeReq({
      file: { buffer: imageBuf("png"), size: 64 },
      body: { size: "1024x1024" },
    }),
    res
  );

  assert.equal(res.statusCode, 507);
  assert.equal(Generation.all().length, 0);
});

test("an upload records the model it was made with", async () => {
  const { db, Generation, ctrl } = setup();
  const res = fakeRes();

  await ctrl.create(
    fakeReq({ file: { buffer: imageBuf("png") }, body: { model: "2" } }),
    res
  );

  const row = Generation.all()[0];
  assert.equal(row.model, "gpt-image-2");
  fs.rmSync(uploadPath(row.filename, UPLOAD_DIR).full, { force: true });
  db.close();
});

test("an upload with no model falls back to the saved setting", async () => {
  const { db, Generation, ctrl, Settings } = setup();
  Settings.update({ model: "2" });
  const res = fakeRes();

  await ctrl.create(fakeReq({ file: { buffer: imageBuf("png") }, body: {} }), res);

  const row = Generation.all()[0];
  assert.equal(row.model, "gpt-image-2");
  fs.rmSync(uploadPath(row.filename, UPLOAD_DIR).full, { force: true });
  db.close();
});

test("an unknown model is not stored", async () => {
  const { db, Generation, ctrl } = setup();
  const res = fakeRes();

  await ctrl.create(
    fakeReq({ file: { buffer: imageBuf("png") }, body: { model: "sneaky" } }),
    res
  );

  const row = Generation.all()[0];
  assert.equal(row.model, "gpt-image-1.5", "falls back to the default");
  fs.rmSync(uploadPath(row.filename, UPLOAD_DIR).full, { force: true });
  db.close();
});

test("the upload form is given the real size limit, not a hardcoded one", () => {
  const { ctrl } = setup();
  const res = fakeRes();

  ctrl.showForm(fakeReq({ body: {} }), res);

  const { uploadMaxBytes } = resolveLimits();
  assert.equal(res.rendered.data.maxBytes, uploadMaxBytes);
});
