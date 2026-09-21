/**
 * Edit entry point tests
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
  return cookieFrom(res) || cookie;
}

test("every image offers an Edit button", async () => {
  const db = freshDb();
  const id = anImage(db, "a cat");
  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/generations`, { headers: { cookie } })
    ).text();
    assert.match(html, new RegExp(`href="/edit/${id}"`));
  } finally {
    app.stop();
    db.close();
  }
});

test("an edited image says what it came from", async () => {
  const db = freshDb();
  const source = anImage(db, "a cat");
  const edited = Number(
    models(db).Generation.add({
      filename: `${process.pid}-edited.png`,
      prompt: "a cat in a red hat",
      model: "gpt-image-2",
      size: "1024x1024",
      edited_from: source,
    })
  );

  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/generations`, { headers: { cookie } })
    ).text();
    assert.match(html, new RegExp(`From #${source}`));
    assert.ok(
      html.indexOf(`href="/edit/${edited}"`) !== -1,
      "and can be edited again"
    );
  } finally {
    app.stop();
    db.close();
  }
});

test("a trashed original still leaves the badge readable", async () => {
  const db = freshDb();
  const source = anImage(db, "a cat");
  models(db).Generation.add({
    filename: `${process.pid}-edited2.png`,
    prompt: "a cat in a red hat",
    model: "gpt-image-2",
    size: "1024x1024",
    edited_from: source,
  });
  models(db).Generation.trash(source);

  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/generations`, { headers: { cookie } })
    ).text();
    assert.match(html, new RegExp(`From #${source}`));
  } finally {
    app.stop();
    db.close();
  }
});
