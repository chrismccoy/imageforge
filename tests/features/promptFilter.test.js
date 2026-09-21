/**
 * Prompt filter tests
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

function anImage(db, prompt, promptId) {
  return Number(
    models(db).Generation.add({
      filename: prompt.replace(/\s/g, "-") + ".png",
      prompt,
      prompt_id: promptId ?? null,
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

test("a prompt's images are found by its id", () => {
  const db = freshDb();
  const { Prompt, Generation } = models(db);
  const mine = Prompt.add("Sunsets", "a sunset");
  const other = Prompt.add("Cats", "a cat");

  anImage(db, "a sunset", mine);
  anImage(db, "another sunset", mine);
  anImage(db, "a cat", other);
  anImage(db, "an upload");

  assert.equal(Generation.count({ promptId: mine }), 2);
  assert.equal(Generation.count({ promptId: other }), 1);
  assert.equal(
    Generation.page({ promptId: mine, limit: 50, offset: 0 }).length,
    2,
    "the count and the rows agree, because the count drives paging"
  );
});

test("an unknown prompt id finds nothing rather than everything", () => {
  const db = freshDb();
  anImage(db, "a cat");
  assert.equal(models(db).Generation.count({ promptId: 9999 }), 0);
});

test("the prompt filter combines with search and favourites", () => {
  const db = freshDb();
  const { Prompt, Generation } = models(db);
  const mine = Prompt.add("Sunsets", "a sunset");
  anImage(db, "a golden sunset", mine);
  anImage(db, "a red sunset", mine);

  assert.equal(
    Generation.count({ promptId: mine, search: "%golden%" }),
    1,
    "the conditions are ANDed, not replaced"
  );
});

test("a link keeps the prompt when you turn the page", () => {
  const { pageLink } = require("../../utils/http/pageLink");
  assert.match(pageLink("/generations", 2, { prompt: "7" }), /prompt=7/);
});

test("the prompts page links its count to those images", async () => {
  const db = freshDb();
  const { Prompt } = models(db);
  const id = Prompt.add("Sunsets", "a sunset");
  anImage(db, "a sunset", id);

  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/prompts`, { headers: { cookie } })
    ).text();
    assert.match(html, new RegExp(`href="/generations\\?prompt=${id}"`));
  } finally {
    app.stop();
    db.close();
  }
});

test("the filtered page shows only that prompt's images", async () => {
  const db = freshDb();
  const { Prompt } = models(db);
  const id = Prompt.add("Sunsets", "a sunset");
  anImage(db, "a golden sunset", id);
  anImage(db, "an unrelated cat");

  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/generations?prompt=${id}`, { headers: { cookie } })
    ).text();

    assert.match(html, /a golden sunset/);
    assert.equal(/an unrelated cat/.test(html), false);
  } finally {
    app.stop();
    db.close();
  }
});

test("a prompt filter with no images says which filter emptied the list", async () => {
  const db = freshDb();
  const { Prompt } = models(db);
  const id = Prompt.add("Unused", "never run");
  anImage(db, "a cat");

  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/generations?prompt=${id}`, { headers: { cookie } })
    ).text();

    assert.equal(/No saved generations yet/i.test(html), false);
    assert.match(html, /prompt/i);
    assert.match(html, /Show everything/);
  } finally {
    app.stop();
    db.close();
  }
});
