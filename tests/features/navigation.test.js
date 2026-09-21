/**
 * Navigation tests
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

function freshDb() {
  const db = new Database(":memory:");
  schema.init(db);
  return db;
}

function models(db) {
  return require("../../models").buildModels(db);
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

function navLink(html, href) {
  const found = new RegExp(
    `<a href="${href.replace(/[?]/g, "\\?")}"[^>]*class="([^"]*)"`
  ).exec(html);
  assert.ok(found, `no sidebar entry for ${href}`);
  return found[1];
}

const ON = "bg-brand-600";

test("the sidebar offers Favourites and Top rated", async () => {
  const db = freshDb();
  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/`, { headers: { cookie } })
    ).text();

    assert.ok(navLink(html, "/generations?fav=1"), "a Favourites entry");
    assert.ok(navLink(html, "/prompts?sort=rating"), "a Top rated entry");
    assert.match(html, /Favourites/);
    assert.match(html, /Top rated/);
  } finally {
    app.stop();
    db.close();
  }
});

test("Favourites lights up instead of Generations when the filter is on", async () => {
  const db = freshDb();
  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);

    const plain = await (
      await fetch(`${app.base}/generations`, { headers: { cookie } })
    ).text();
    assert.match(navLink(plain, "/generations"), new RegExp(ON));
    assert.doesNotMatch(navLink(plain, "/generations?fav=1"), new RegExp(ON));

    const starred = await (
      await fetch(`${app.base}/generations?fav=1`, { headers: { cookie } })
    ).text();
    assert.match(navLink(starred, "/generations?fav=1"), new RegExp(ON));
    assert.doesNotMatch(navLink(starred, "/generations"), new RegExp(ON));
  } finally {
    app.stop();
    db.close();
  }
});

test("Top rated lights up instead of Prompts when sorted by rating", async () => {
  const db = freshDb();
  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);

    const plain = await (
      await fetch(`${app.base}/prompts`, { headers: { cookie } })
    ).text();
    assert.match(navLink(plain, "/prompts"), new RegExp(ON));
    assert.doesNotMatch(navLink(plain, "/prompts?sort=rating"), new RegExp(ON));

    const rated = await (
      await fetch(`${app.base}/prompts?sort=rating`, { headers: { cookie } })
    ).text();
    assert.match(navLink(rated, "/prompts?sort=rating"), new RegExp(ON));
    assert.doesNotMatch(navLink(rated, "/prompts"), new RegExp(ON));
  } finally {
    app.stop();
    db.close();
  }
});

test("adding or editing a prompt still lights up Prompts", async () => {
  const db = freshDb();
  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/prompts/new`, { headers: { cookie } })
    ).text();

    assert.match(navLink(html, "/prompts"), new RegExp(ON));
  } finally {
    app.stop();
    db.close();
  }
});

test("a collection's count links through to the images in it", async () => {
  const db = freshDb();
  const { Collection, Generation } = models(db);
  const id = Number(Generation.add({ filename: "a.png", prompt: "a cat" }));
  const work = Collection.add("Client work", "2026-08-10T10:00:00.000Z");
  Collection.addImage(id, work);

  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/collections`, { headers: { cookie } })
    ).text();

    assert.match(
      html,
      new RegExp(`href="/generations\\?collection=${work}"`),
      "the count links to the images"
    );
  } finally {
    app.stop();
    db.close();
  }
});

test("the gallery opens in its own tab, and nothing else does", async () => {
  const db = freshDb();
  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/`, { headers: { cookie } })
    ).text();

    const gallery = /<a href="\/gallery"([^>]*)>/.exec(html)[1];
    assert.match(gallery, /target="_blank"/);
    assert.match(gallery, /rel="noopener"/);

    for (const href of ["/prompts", "/collections", "/generations", "/settings"]) {
      const other = new RegExp(`<a href="${href}"([^>]*)>`).exec(html)[1];
      assert.doesNotMatch(other, /target="_blank"/, `${href} stays in this tab`);
    }
  } finally {
    app.stop();
    db.close();
  }
});

test("Import / Export has its own sidebar entry that lights up", async () => {
  const db = freshDb();
  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);

    const list = await (
      await fetch(`${app.base}/prompts`, { headers: { cookie } })
    ).text();
    assert.ok(navLink(list, "/prompts/backup"), "the entry exists");
    assert.match(navLink(list, "/prompts"), new RegExp(ON), "Prompts is lit here");
    assert.doesNotMatch(navLink(list, "/prompts/backup"), new RegExp(ON));

    const backup = await (
      await fetch(`${app.base}/prompts/backup`, { headers: { cookie } })
    ).text();
    assert.match(navLink(backup, "/prompts/backup"), new RegExp(ON));
    assert.doesNotMatch(
      navLink(backup, "/prompts"),
      new RegExp(ON),
      "and Prompts is not"
    );
  } finally {
    app.stop();
    db.close();
  }
});

const { NAV_LINKS, NAV_GROUPS } = require("../../config/navigation");

test("the groups run main, library, public, system", () => {
  assert.deepEqual(
    NAV_GROUPS.map((group) => group.key),
    ["main", "library", "public", "system"]
  );
});

test("every entry belongs to a group that exists", () => {
  const known = new Set(NAV_GROUPS.map((group) => group.key));
  for (const link of NAV_LINKS) {
    assert.ok(known.has(link.group), `${link.label} has no group`);
  }
});

test("every entry names a font awesome icon and no emoji", () => {
  for (const link of NAV_LINKS) {
    assert.match(link.icon, /^fa-(solid|regular) fa-[a-z0-9-]+$/, link.label);
  }
});
