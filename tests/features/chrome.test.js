/**
 * Sidebar items
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
const os = require("os");
const path = require("path");

const { startApp, signIn, freshDb } = require("../helpers/app");
const { createUploadsUsage } = require("../../services/uploadsUsage");
const { readableBytes } = require("../../utils/domain/format");
const { PAGES } = require("../../config/urls");

function models(db) {
  return require("../../models").buildModels(db);
}

function anImage(db, prompt, extra = {}) {
  return Number(
    models(db).Generation.add(
      Object.assign(
        {
          filename: `${process.pid}-chrome-${prompt}.png`,
          prompt,
          model: "gpt-image-1.5",
          size: "1024x1024",
        },
        extra
      )
    )
  );
}

function sidebarRow(html, href) {
  const aside = /<aside[\s\S]*?<\/aside>/.exec(html)[0];
  const re = new RegExp(`href="${href.replace(/[?]/g, "\\?")}"[\\s\\S]*?</a>`);
  return re.exec(aside)[0];
}

test("the sidebar counts what the library holds", async () => {
  const db = freshDb();
  const { Prompt, Category, Collection, Generation } = models(db);

  const now = new Date().toISOString();
  const category = Category.add("Portraits", now);
  Prompt.add("One", "a cat", category);
  Collection.add("Winter", now);
  const starred = anImage(db, "starred");
  Generation.toggleFavorite(starred);
  anImage(db, "plain");

  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/`, { headers: { cookie } })
    ).text();

    const row = (href) => sidebarRow(html, href);

    assert.match(row("/generations"), />\s*2\s*</, "two images");
    assert.match(row("/prompts"), />\s*1\s*</, "one prompt");
    assert.match(row("/collections"), />\s*1\s*</, "one collection");
    assert.match(row("/generations?fav=1"), />\s*1\s*</, "one favourite");

    assert.doesNotMatch(row(PAGES.gallery), /tabular-nums/, "no gallery badge");
  } finally {
    app.stop();
    db.close();
  }
});

test("the trash count is the images waiting to be destroyed", async () => {
  const db = freshDb();
  const { Generation } = models(db);
  const id = anImage(db, "doomed");
  Generation.trash(id);

  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/`, { headers: { cookie } })
    ).text();
    const row = sidebarRow(html, "/trash");

    assert.match(row, />\s*1\s*</);
  } finally {
    app.stop();
    db.close();
  }
});

test("a count of nothing is not drawn", async () => {
  const db = freshDb();
  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/`, { headers: { cookie } })
    ).text();
    const row = sidebarRow(html, "/collections");

    assert.doesNotMatch(row, />\s*0\s*</);
  } finally {
    app.stop();
    db.close();
  }
});

test("the storage bar reads the same folder the dashboard does", async () => {
  const db = freshDb();
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-chrome-"));
  fs.writeFileSync(path.join(uploadDir, "seed.bin"), Buffer.alloc(54321));

  const app = await startApp({ db, folders: { uploadDir } });
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/`, { headers: { cookie } })
    ).text();

    assert.match(html, /of quota used/);

    const usage = createUploadsUsage({ dir: uploadDir });
    const actual = readableBytes(await usage.bytes());

    assert.match(
      html,
      new RegExp(`>\\s*${actual.replace(/[.]/g, "\\.")}\\s+of\\s`),
      `the sidebar should read ${actual}, what usage.bytes() reports for this folder`
    );
  } finally {
    app.stop();
    db.close();
    fs.rmSync(uploadDir, { recursive: true, force: true });
  }
});

test("the sidebar counts the shared images beside the gallery", async () => {
  const db = freshDb();
  const { Generation } = models(db);

  Generation.setShareToken(anImage(db, "shared one"), "SIDEBARTOK1");
  Generation.setShareToken(anImage(db, "shared two"), "SIDEBARTOK2");
  anImage(db, "kept private");

  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/`, { headers: { cookie } })
    ).text();
    const row = sidebarRow(html, PAGES.gallery);

    assert.match(row, />\s*2\s*</, "two shared, not three");

    assert.doesNotMatch(row, /fa-arrow-up-right-from-square/, "no arrow");
    assert.match(row, /target="_blank"/, "still opens in a new tab");
    assert.match(row, /rel="noopener"/);
  } finally {
    app.stop();
    db.close();
  }
});
