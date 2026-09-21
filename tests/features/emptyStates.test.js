/**
 * Empty state tests
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";

const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const schema = require("../../db/schema");
const { createApp } = require("../../server");

const NOW = "2026-08-10T10:00:00.000Z";

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
      filename: prompt.replace(/\s/g, "-") + ".png",
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

function emptyState(html) {
  const found =
    /<div class="[^"]*border-dashed[^"]*">([\s\S]*?)<\/div>\s*<%|<div class="[^"]*border-dashed[^"]*">([\s\S]*?)<\/div>/.exec(
      html
    );
  if (!/border-dashed/.test(html)) return null;
  const body = html.slice(html.indexOf("border-dashed"));
  return body
    .slice(0, body.indexOf("</div>", body.indexOf("</div>") + 1))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

test("an empty favourites page says so, and how to fill it", async () => {
  const db = freshDb();
  anImage(db, "a cat");

  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/generations?fav=1`, { headers: { cookie } })
    ).text();

    assert.match(html, /No favourites yet/i);
    assert.match(html, /star/i, "it should say how an image gets here");
    assert.match(html, /Show everything/);
    assert.match(html, /<h1[^>]*>\s*Favourites/, "the heading matches the sidebar");
  } finally {
    app.stop();
    db.close();
  }
});

test("an empty collection blames the collection, not the library", async () => {
  const db = freshDb();
  anImage(db, "a cat");
  const empty = models(db).Collection.add("Nothing in here", NOW);

  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/generations?collection=${empty}`, {
        headers: { cookie },
      })
    ).text();

    assert.equal(
      /No saved generations yet/i.test(html),
      false,
      "must not claim the library is empty"
    );
    assert.match(html, /collection/i);
    assert.match(html, /Show everything/, "and must offer a way back");
  } finally {
    app.stop();
    db.close();
  }
});

test("the unfiled filter says what it means when nothing is unfiled", async () => {
  const db = freshDb();
  const id = anImage(db, "a cat");
  const { Collection } = models(db);
  Collection.addImage(id, Collection.add("Everything", NOW));

  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/generations?collection=none`, {
        headers: { cookie },
      })
    ).text();

    assert.equal(/No saved generations yet/i.test(html), false);
    assert.match(html, /Show everything/);
  } finally {
    app.stop();
    db.close();
  }
});

test("a genuinely empty library says so, and points at Generate", async () => {
  const db = freshDb();
  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/generations`, { headers: { cookie } })
    ).text();

    assert.match(html, /No saved generations yet/i);
    assert.equal(/Show everything/.test(html), false);
    assert.match(html, /href="\/"/, "a way to make the first one");
  } finally {
    app.stop();
    db.close();
  }
});

test("a search that finds nothing quotes what was searched for", async () => {
  const db = freshDb();
  anImage(db, "a cat");

  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/generations?q=zzzznothing`, { headers: { cookie } })
    ).text();

    assert.match(html, /zzzznothing/);
    assert.match(html, /Show everything/);
  } finally {
    app.stop();
    db.close();
  }
});

test("an empty list drops the controls that have nothing to act on", async () => {
  const db = freshDb();
  anImage(db, "a cat");

  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const empty = await (
      await fetch(`${app.base}/generations?fav=1`, { headers: { cookie } })
    ).text();

    assert.equal(/Search prompts/.test(empty), false, "no search box");
    assert.equal(/name="collection"/.test(empty), false, "no collection filter");
    assert.equal(/Download all/.test(empty), false, "nothing to download");
    assert.equal(/0 of 1 saved/.test(empty), false, "no count");

    const full = await (
      await fetch(`${app.base}/generations`, { headers: { cookie } })
    ).text();
    assert.match(full, /Search prompts/, "the controls come back with content");
    assert.match(full, /name="collection"/);
  } finally {
    app.stop();
    db.close();
  }
});

test("Favourites does not offer New generation", async () => {
  const db = freshDb();
  const id = anImage(db, "a cat");
  models(db).Generation.toggleFavorite(id);

  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const favourites = await (
      await fetch(`${app.base}/generations?fav=1`, { headers: { cookie } })
    ).text();
    const generations = await (
      await fetch(`${app.base}/generations`, { headers: { cookie } })
    ).text();

    const links = (html) => (html.match(/href="\/generate"/g) || []).length;
    assert.equal(
      links(generations),
      links(favourites) + 1,
      "the page's own action button, on top of what the shell already links"
    );
  } finally {
    app.stop();
    db.close();
  }
});
