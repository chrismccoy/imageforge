/**
 * Regenerate tests
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

test("from an image, the generate page opens pre-filled", async () => {
  const db = freshDb();
  const id = Number(
    models(db).Generation.add({
      filename: "a.png",
      prompt: "a golden sunset over Tokyo",
      model: "gpt-image-2",
      size: "1024x1536",
    })
  );

  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/generate?from=${id}`, { headers: { cookie } })
    ).text();

    assert.match(html, /a golden sunset over Tokyo/, "the prompt is in the box");
    assert.match(html, /<option value="1024x1536" selected/);
    assert.match(html, /name="model" value="2"[^>]*checked/);
  } finally {
    app.stop();
    db.close();
  }
});

test("an unknown image opens the page as normal rather than erroring", async () => {
  const db = freshDb();
  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const res = await fetch(`${app.base}/generate?from=9999`, {
      headers: { cookie },
    });

    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /<textarea id="prompt"[^>]*>\s*<\/textarea>/);
  } finally {
    app.stop();
    db.close();
  }
});

test("a card offers Regenerate, pointing at itself", async () => {
  const db = freshDb();
  const id = Number(
    models(db).Generation.add({ filename: "a.png", prompt: "a cat" })
  );

  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/generations`, { headers: { cookie } })
    ).text();

    assert.match(html, new RegExp(`href="/generate\\?from=${id}"`));
    assert.match(html, /Regenerate/);
  } finally {
    app.stop();
    db.close();
  }
});

test("the generate page offers a repeat once there is a result", async () => {
  const db = freshDb();
  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/generate`, { headers: { cookie } })
    ).text();

    assert.match(html, /id="again-btn"/);
    assert.match(html, /id="again-btn"[^>]*\shidden[\s>]/);
  } finally {
    app.stop();
    db.close();
  }
});

test("regenerating keeps the link to the prompt it came from", async () => {
  const db = freshDb();
  const { Prompt } = models(db);
  const promptId = Number(Prompt.add("Sunsets", "{color} sunset over {place}"));
  const id = anImage(db, "a golden sunset over Tokyo", promptId);

  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/generate?from=${id}`, { headers: { cookie } })
    ).text();

    assert.match(
      html,
      new RegExp(`<option[^>]*data-id="${promptId}"[^>]*selected`),
      "the source prompt is chosen in the dropdown"
    );
    assert.match(html, /a golden sunset over Tokyo<\/textarea>/);
  } finally {
    app.stop();
    db.close();
  }
});

test("an image made without a saved prompt selects nothing", async () => {
  const db = freshDb();
  const id = anImage(db, "an upload");

  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/generate?from=${id}`, { headers: { cookie } })
    ).text();
    assert.equal(/data-id="[0-9]+"[^>]*selected/.test(html), false);
  } finally {
    app.stop();
    db.close();
  }
});
