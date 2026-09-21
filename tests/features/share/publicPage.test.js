/**
 * The public share page
 */

"use strict";

const { PNG_BYTES, addGeneration, useSharedApp } = require("./setup");

const test = require("node:test");
const assert = require("node:assert/strict");

const Database = require("better-sqlite3");
const buildGeneration = require("../../../models/generation");
const fs = require("fs");
const path = require("path");
const { UPLOAD_DIR } = require("../../../config/paths");
const { createApp } = require("../../../server");

const shared = useSharedApp();

test("a share link renders the public page without logging in", async () => {
  const res = await fetch(`${shared.base}/s/tok-shared`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /a shared cat/);
  assert.match(html, /\/i\/tok-shared/);
  assert.equal(html.includes(shared.file), false);
  assert.equal(html.includes("Log out"), false);
});

test("a share image link returns the bytes", async () => {
  const res = await fetch(`${shared.base}/i/tok-shared`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/png");
  const body = Buffer.from(await res.arrayBuffer());
  assert.equal(body.length, PNG_BYTES.length);
});

test("a share image link works with the file's extension on it", async () => {
  const res = await fetch(`${shared.base}/i/tok-shared.png`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/png");
  const body = Buffer.from(await res.arrayBuffer());
  assert.equal(body.length, PNG_BYTES.length);
});

test("an extension the file is not is refused", async () => {
  const res = await fetch(`${shared.base}/i/tok-shared.jpg`);
  assert.equal(res.status, 404);
});

test("an extension the app does not serve is not a picture", async () => {
  const res = await fetch(`${shared.base}/i/tok-shared.exe`);
  assert.equal(res.status, 404);
});

test("a slug in front and an extension behind still find the image", async () => {
  const Generation = buildGeneration(shared.db);
  const id = addGeneration(Generation, shared.file, "a slugged cat");
  Generation.setShareToken(id, "tokSlugged");

  const res = await fetch(`${shared.base}/i/a-slugged-cat-tokSlugged.png`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/png");
});

test("an extension does not survive revocation", async () => {
  const Generation = buildGeneration(shared.db);
  const id = addGeneration(Generation, shared.file, "briefly public");
  Generation.setShareToken(id, "tokBrief12");

  assert.equal((await fetch(`${shared.base}/i/tokBrief12.png`)).status, 200);

  Generation.clearShareToken(id);
  assert.equal((await fetch(`${shared.base}/i/tokBrief12.png`)).status, 404);
});

test("an old image link redirects to the form that carries the extension", async () => {
  const res = await fetch(`${shared.base}/i/tok-shared`, { redirect: "manual" });

  assert.equal(res.status, 301);
  assert.equal(res.headers.get("location"), "/i/tok-shared.png");
});

test("following that redirect gives the bytes", async () => {
  const res = await fetch(`${shared.base}/i/tok-shared`);

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/png");
});

test("a slugged old link keeps its slug across the redirect", async () => {
  const Generation = buildGeneration(shared.db);
  const id = addGeneration(Generation, shared.file, "a redirected cat");
  Generation.setShareToken(id, "tokRedir01");

  const res = await fetch(`${shared.base}/i/a-redirected-cat-tokRedir01`, {
    redirect: "manual",
  });

  assert.equal(res.status, 301);
  assert.equal(res.headers.get("location"), "/i/a-redirected-cat-tokRedir01.png");
});

test("a file with no usable extension is served rather than redirected", async () => {
  const Generation = buildGeneration(shared.db);
  const bare = `share-test-bare-${process.pid}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, bare), PNG_BYTES);

  try {
    const id = addGeneration(Generation, bare, "no extension");
    Generation.setShareToken(id, "tokNoExt01");

    const res = await fetch(`${shared.base}/i/tokNoExt01`, { redirect: "manual" });
    assert.equal(res.status, 200);
  } finally {
    fs.rmSync(path.join(UPLOAD_DIR, bare), { force: true });
  }
});

test("an unknown token is not found rather than redirected", async () => {
  const res = await fetch(`${shared.base}/i/nosuchtoken`, { redirect: "manual" });
  assert.equal(res.status, 404);
});

test("an unknown share token is a 404 page, not a redirect to login", async () => {
  const res = await fetch(`${shared.base}/s/bogus`, { redirect: "manual" });
  assert.equal(res.status, 404);
  const html = await res.text();
  assert.equal(html.includes("Log out"), false);
});

test("a revoked share token stops working", async () => {
  const Generation = buildGeneration(shared.db);
  const id = addGeneration(Generation, shared.file, "temporary");
  Generation.setShareToken(id, "tok-temp");

  const live = await fetch(`${shared.base}/s/tok-temp`);
  assert.equal(live.status, 200);

  Generation.clearShareToken(id);
  const dead = await fetch(`${shared.base}/s/tok-temp`);
  assert.equal(dead.status, 404);
});

test("the uploads route still refuses an anonymous visitor", async () => {
  const res = await fetch(`${shared.base}/uploads/${shared.file}`, {
    redirect: "manual",
  });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "/login");
});
