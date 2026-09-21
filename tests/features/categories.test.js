/**
 * Category tests
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

const NOW = "2026-08-10T00:00:00.000Z";

function freshDb() {
  const db = new Database(":memory:");
  schema.init(db);
  return db;
}

function build(db) {
  return {
    Category: require("../../models/category")(db),
    Prompt: require("../../models/prompt")(db),
  };
}

test("a fresh database has the categories table and the prompt columns", () => {
  const db = freshDb();

  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((r) => r.name);
  assert.ok(tables.includes("categories"));

  const columns = db
    .prepare("PRAGMA table_info(prompts)")
    .all()
    .map((c) => c.name);
  assert.ok(columns.includes("category_id"));
  assert.ok(columns.includes("rating"));
});

test("categories are added and listed in name order", () => {
  const { Category } = build(freshDb());

  assert.ok(Category.add("logos", NOW));
  assert.ok(Category.add("Landscapes", NOW));

  assert.deepEqual(
    Category.all().map((c) => c.name),
    ["Landscapes", "logos"]
  );
});

test("a blank name is refused", () => {
  const { Category } = build(freshDb());

  assert.equal(Category.add("", NOW), null);
  assert.equal(Category.add("   ", NOW), null);
  assert.equal(Category.all().length, 0);
});

test("a duplicate name is refused whatever its case", () => {
  const { Category } = build(freshDb());

  assert.ok(Category.add("logos", NOW));
  assert.equal(Category.add("Logos", NOW), null);
  assert.equal(Category.add("LOGOS", NOW), null);
  assert.equal(Category.all().length, 1);
});

test("renaming refuses a blank or a name already taken", () => {
  const { Category } = build(freshDb());
  const logos = Category.add("logos", NOW);
  Category.add("landscapes", NOW);

  assert.equal(Category.rename(logos, ""), false);
  assert.equal(Category.rename(logos, "Landscapes"), false);
  assert.equal(Category.rename(logos, "brand marks"), true);
  assert.equal(Category.get(logos).name, "brand marks");
});

function filedPrompt(db, name, categoryId) {
  db.prepare(
    "INSERT INTO prompts (name, prompt, created_at, category_id) VALUES (?, 'x', ?, ?)"
  ).run(name, NOW, categoryId);
}

test("the list reports how many prompts use each category", () => {
  const db = freshDb();
  const { Category } = build(db);
  const logos = Category.add("logos", NOW);
  Category.add("unused", NOW);

  filedPrompt(db, "A", logos);
  filedPrompt(db, "B", logos);

  const byName = Object.fromEntries(Category.all().map((c) => [c.name, c.uses]));
  assert.equal(byName.logos, 2);
  assert.equal(byName.unused, 0);
});

test("removing a category detaches its prompts rather than deleting them", () => {
  const db = freshDb();
  const { Category, Prompt } = build(db);
  const logos = Category.add("logos", NOW);
  filedPrompt(db, "A", logos);

  Category.remove(logos);

  assert.equal(Category.all().length, 0);
  assert.equal(Prompt.all().length, 1, "the prompt survives");
  const row = db.prepare("SELECT category_id FROM prompts").get();
  assert.equal(row.category_id, null, "and is detached");
});

test("removing a category that does not exist is a no-op", () => {
  const { Category } = build(freshDb());
  assert.doesNotThrow(() => Category.remove(9999));
});

test("a prompt stores and reads back its category", () => {
  const db = freshDb();
  const { Category, Prompt } = build(db);
  const logos = Category.add("logos", NOW);

  const id = Prompt.add("A", "a mark", logos);
  const row = Prompt.page({ limit: 10, offset: 0 })[0];

  assert.equal(row.category_id, logos);
  assert.equal(row.category_name, "logos");

  Prompt.update(id, "A", "a mark", null);
  assert.equal(Prompt.page({ limit: 10, offset: 0 })[0].category_id, null);
});

test("a category id that is not a positive integer stores nothing", () => {
  const db = freshDb();
  const { Prompt } = build(db);

  Prompt.add("A", "x", "banana");
  Prompt.add("B", "x", 0);
  Prompt.add("C", "x", -3);

  for (const row of Prompt.page({ limit: 10, offset: 0 })) {
    assert.equal(row.category_id, null, `${row.name} should be uncategorised`);
  }
});

test("the category filter selects one category, or the unfiled", () => {
  const db = freshDb();
  const { Category, Prompt } = build(db);
  const logos = Category.add("logos", NOW);
  Prompt.add("A", "a mark", logos);
  Prompt.add("B", "another mark", logos);
  Prompt.add("C", "unfiled", null);

  assert.equal(Prompt.count({ categoryId: logos }), 2);
  assert.deepEqual(
    Prompt.page({ categoryId: logos, limit: 10, offset: 0 }).map((r) => r.name),
    ["A", "B"]
  );

  assert.equal(Prompt.count({ categoryId: "none" }), 1);
  assert.deepEqual(
    Prompt.page({ categoryId: "none", limit: 10, offset: 0 }).map((r) => r.name),
    ["C"]
  );

  assert.equal(Prompt.count({ categoryId: "banana" }), 3);
  assert.equal(Prompt.count({}), 3);
});

test("the category filter composes with a search", () => {
  const db = freshDb();
  const { Category, Prompt } = build(db);
  const logos = Category.add("logos", NOW);
  Prompt.add("Round mark", "a mark", logos);
  Prompt.add("Square mark", "a mark", logos);
  Prompt.add("Round hill", "a hill", null);

  assert.equal(Prompt.count({ categoryId: logos, search: "%round%" }), 1);
});

const { createApp } = require("../../server");

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
  const cookie = cookieFrom(res) || loginCookie;

  const after = await fetch(`${base}/categories`, { headers: { cookie } });
  const csrf = /name="_csrf" value="([^"]+)"/.exec(await after.text())[1];
  return { cookie, csrf };
}

test("the categories page lists, adds and deletes", async () => {
  const db = freshDb();
  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);

    const post = (path, fields) =>
      fetch(`${app.base}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", cookie },
        body: new URLSearchParams({ _csrf: csrf, ...fields }).toString(),
        redirect: "manual",
      });

    await post("/categories", { name: "logos" });
    let html = await (
      await fetch(`${app.base}/categories`, { headers: { cookie } })
    ).text();
    assert.match(html, /logos/);

    const id = require("../../models/category")(db).all()[0].id;
    await post(`/categories/${id}/delete`, {});

    html = await (
      await fetch(`${app.base}/categories`, { headers: { cookie } })
    ).text();
    assert.equal(html.includes('value="logos"'), false);
  } finally {
    app.stop();
    db.close();
  }
});

test("a duplicate category is refused with a message, not an error page", async () => {
  const db = freshDb();
  require("../../models/category")(db).add("logos", NOW);

  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);
    const res = await fetch(`${app.base}/categories`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", cookie },
      body: new URLSearchParams({ _csrf: csrf, name: "LOGOS" }).toString(),
    });

    assert.equal(res.status, 400);
    assert.match(await res.text(), /already/i);
  } finally {
    app.stop();
    db.close();
  }
});

test("the categories page needs a login", async () => {
  const db = freshDb();
  const app = await startApp(db);
  try {
    const res = await fetch(`${app.base}/categories`, { redirect: "manual" });
    assert.equal(res.status, 302);
  } finally {
    app.stop();
    db.close();
  }
});

test("no categories yet shows the empty state", async () => {
  const db = freshDb();
  const app = await startApp(db);
  try {
    const { cookie } = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/categories`, { headers: { cookie } })
    ).text();

    assert.match(html, /No categories yet\./);
  } finally {
    app.stop();
    db.close();
  }
});

test("the prompts page filters by category and keeps it while paging", async () => {
  const db = freshDb();
  const Category = require("../../models/category")(db);
  const Prompt = require("../../models/prompt")(db);
  const logos = Category.add("logos", NOW);
  Prompt.add("A mark", "a mark", logos);
  Prompt.add("A hill", "a hill", null);

  const app = await startApp(db);
  try {
    const { cookie } = await signIn(app.base);
    const get = (path) =>
      fetch(`${app.base}${path}`, { headers: { cookie } }).then((r) => r.text());

    const filtered = await get(`/prompts?category=${logos}`);
    assert.match(filtered, /1 of 2/);
    assert.match(filtered, /A mark/);
    assert.equal(filtered.includes("A hill"), false);

    const unfiled = await get("/prompts?category=none");
    assert.match(unfiled, /A hill/);
    assert.equal(unfiled.includes("A mark"), false);
  } finally {
    app.stop();
    db.close();
  }
});

test("the prompt form offers the categories and saves the choice", async () => {
  const db = freshDb();
  const Category = require("../../models/category")(db);
  const logos = Category.add("logos", NOW);

  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);

    const form = await (
      await fetch(`${app.base}/prompts/new`, { headers: { cookie } })
    ).text();
    assert.match(form, /name="category_id"/);
    assert.match(form, /logos/);

    await fetch(`${app.base}/prompts`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", cookie },
      body: new URLSearchParams({
        _csrf: csrf,
        name: "A mark",
        prompt: "a mark",
        category_id: String(logos),
      }).toString(),
      redirect: "manual",
    });

    const rows = require("../../models/prompt")(db).page({ limit: 10, offset: 0 });
    assert.equal(rows[0].category_id, logos);
  } finally {
    app.stop();
    db.close();
  }
});
