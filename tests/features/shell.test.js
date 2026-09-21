/**
 * The shell tests
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";

const test = require("node:test");
const assert = require("node:assert/strict");

const { startApp, signIn, freshDb } = require("../helpers/app");
const { buildModels } = require("../../models");

async function page(path, db = freshDb()) {
  const app = await startApp({ db });
  const cookie = await signIn(app.base);
  const html = await (
    await fetch(`${app.base}${path}`, { headers: { cookie } })
  ).text();
  app.stop();
  return html;
}

function seededDb() {
  const db = freshDb();
  const { Category, Prompt, Collection, Generation } = buildModels(db);
  const now = new Date().toISOString();

  const category = Category.add("Landscapes", now);
  const promptId = Prompt.add("A sunset", "a sunset over the sea", category, {
    size: "1024x1024",
    model: "gpt-image-2",
  });
  Prompt.setRating(promptId, 4);
  const collectionId = Collection.add("Client work", now);

  const imageId = Generation.add({
    filename: "sunset.png",
    prompt: "a sunset over the sea",
    prompt_id: promptId,
    model: "gpt-image-2",
    size: "1024x1024",
  });
  Collection.addImage(imageId, collectionId);
  Generation.toggleFavorite(imageId);

  const trashedId = Generation.add({
    filename: "trashed.png",
    prompt: "a discarded sketch",
    model: "gpt-image-2",
    size: "1024x1024",
  });
  Generation.trash(trashedId);

  return db;
}

test("the sidebar draws a heading for every group", async () => {
  const html = await page("/");
  for (const title of ["Main", "Library", "Public", "System"]) {
    assert.match(html, new RegExp(`>${title}<`), `no ${title} heading`);
  }
});

test("a sidebar entry draws its icon", async () => {
  const html = await page("/");
  assert.match(html, /<i class="fa-solid fa-gauge-high"/);
  assert.match(html, /<i class="fa-regular fa-images"/);
});

test("no emoji is left in the shell", async () => {
  const html = await page("/");
  assert.doesNotMatch(html, /[\u{1F300}-\u{1FAFF}]/u);
});

test("the top bar offers search, upload and a new generation", async () => {
  const html = await page("/");
  const header = /<header[\s\S]*?<\/header>/.exec(html)[0];
  assert.match(header, /<form[^>]*action="\/generations"[^>]*>[\s\S]*?name="q"/);
  assert.match(header, /href="\/upload"/);
  assert.match(header, /href="\/generate"/);
});

test("the page still names itself", async () => {
  const html = await page("/prompts");
  const h1 = /<h1[^>]*>[\s\S]*?<\/h1>/.exec(html)[0];
  assert.match(h1, /Prompts/);
});

test("the page-head row stays open after the title for a view to add its own buttons", async () => {
  const html = await page("/");
  const h1 = html.indexOf("<h1");
  const rowClose = html.indexOf("<span data-page-head-end");
  assert.notEqual(h1, -1, "no h1");
  assert.notEqual(rowClose, -1, "no page-head row close marker");
  assert.ok(
    h1 < rowClose,
    "the row closes before the title, so a view could never add anything inside it"
  );
});

test("no page behind the login draws an emoji", async () => {
  const db = seededDb();
  for (const path of [
    "/",
    "/generate",
    "/generations",
    "/generations?fav=1",
    "/prompts",
    "/prompts/new",
    "/categories",
    "/collections",
    "/upload",
    "/settings",
    "/trash",
    "/prompts/backup",
    "/nope",
  ]) {
    const html = await page(path, db);
    assert.doesNotMatch(html, /[\u{1F300}-\u{1FAFF}\u{2190}-\u{2BFF}]/u, path);
  }
});
