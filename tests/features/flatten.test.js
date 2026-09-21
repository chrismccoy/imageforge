/**
 * Flattening an edit
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";
process.env.OPENAI_API_KEY = "";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createPendingImages } = require("../../services/pendingImages");

const A_PICTURE = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082",
  "hex"
);

const openai = require("../../services/openai");
openai.generateImage = async () => ({
  model: "gpt-image-1.5",
  usage: null,
  images: [
    {
      bytes: A_PICTURE,
      dataUrl: `data:image/png;base64,${A_PICTURE.toString("base64")}`,
    },
  ],
});

const { startApp, signIn, csrfFor, freshDb } = require("../helpers/app");
const { UPLOAD_DIR } = require("../../config/paths");

test("replacing the bytes keeps everything else about the image", () => {
  const pending = createPendingImages();
  const token = pending.put(Buffer.from("first"), { prompt: "a cat", model: "x" });
  const held = pending.peek(token);

  assert.equal(pending.replace(token, Buffer.from("second")), true);

  const now = pending.peek(token);
  assert.equal(now.bytes.toString(), "second", "the picture is the new one");
  assert.deepEqual(now.meta, held.meta, "and everything said about it survives");
  assert.equal(now.expiresAt, held.expiresAt, "including when it runs out");
});

test("replacing something that is not held changes nothing", () => {
  const pending = createPendingImages();
  assert.equal(pending.replace("nosuchtoken", Buffer.from("x")), false);
});

test("an expired image cannot be replaced back into life", async () => {
  const pending = createPendingImages({ ttlMs: 1 });
  const token = pending.put(Buffer.from("first"), {});
  await new Promise((resolve) => setTimeout(resolve, 5));

  assert.equal(pending.replace(token, Buffer.from("second")), false);
  assert.equal(pending.peek(token), null);
  pending.close();
});

let app;
let db;
let cookie;
let csrf;

test.before(async () => {
  db = freshDb();
  app = await startApp({ db });
  cookie = await signIn(app.base);
  csrf = await csrfFor(app.base, cookie);
});

test.after(() => app.stop());

async function heldImage() {
  const res = await fetch(`${app.base}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf, cookie },
    body: JSON.stringify({ prompt: "a red bicycle", size: "1024x1024" }),
  });
  const body = await res.json();
  return body.images[0].token;
}

async function flatten({ token, bytes = A_PICTURE, csrfToken = csrf }) {
  const form = new FormData();
  form.set("_csrf", csrfToken);
  form.set("token", String(token));
  form.append("image", new Blob([bytes], { type: "image/png" }), "flat.png");

  const res = await fetch(`${app.base}/api/flatten`, {
    method: "POST",
    headers: { cookie },
    body: form,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

test("a flattened picture takes the place of the one being held", async () => {
  const token = await heldImage();
  const flat = Buffer.concat([A_PICTURE, Buffer.from("flattened")]);

  const out = await flatten({ token, bytes: flat });
  assert.equal(out.status, 200);

  const saved = await fetch(`${app.base}/api/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf, cookie },
    body: JSON.stringify({ token }),
  });
  assert.equal(saved.status, 200);

  const { uploadPath } = require("../../utils/files/uploads");
  const url = (await saved.json()).url;
  const fs = require("fs");
  const full = uploadPath(url.replace("/uploads/", ""), UPLOAD_DIR).full;
  const written = fs.readFileSync(full);
  fs.rmSync(full, { force: true });

  assert.equal(written.length, flat.length, "the file is the flattened one");
});

test("a token nobody is holding is refused", async () => {
  const out = await flatten({ token: "nosuchtoken" });
  assert.equal(out.status, 400);
});

test("bytes that are not a picture are refused, and the held image survives", async () => {
  const token = await heldImage();

  const out = await flatten({ token, bytes: Buffer.from("not a picture") });
  assert.equal(out.status, 400);

  const saved = await fetch(`${app.base}/api/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf, cookie },
    body: JSON.stringify({ token }),
  });
  assert.equal(saved.status, 200, "the picture that was paid for is not lost");

  const { uploadPath } = require("../../utils/files/uploads");
  const fs = require("fs");
  fs.rmSync(
    uploadPath((await saved.json()).url.replace("/uploads/", ""), UPLOAD_DIR).full,
    {
      force: true,
    }
  );
});

test("a forged post is refused", async () => {
  const token = await heldImage();
  const out = await flatten({ token, csrfToken: "WRONG" });
  assert.equal(out.status, 403);
});
