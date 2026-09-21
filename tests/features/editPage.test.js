/**
 * Edit page tests
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
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      cookie,
    },
    body: `_csrf=${csrf}&username=admin&password=test-pass`,
    redirect: "manual",
  });
  return cookieFrom(res) || cookie;
}

test("the page shows the image and its prompt", async () => {
  const db = freshDb();
  const id = anImage(db, "a cat on a wall");
  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const res = await fetch(`${app.base}/edit/${id}`, { headers: { cookie } });
    const html = await res.text();

    assert.equal(res.status, 200);
    assert.match(html, new RegExp(`/uploads/${process.pid}-a-cat-on-a-wall.png`));
    assert.match(html, /a cat on a wall/, "the prompt it started from");
    assert.match(html, /id="mask"/, "and something to brush on");
  } finally {
    app.stop();
    db.close();
  }
});

test("the result sits over the picture, not below it", async () => {
  const db = freshDb();
  const id = anImage(db, "a cat");
  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/edit/${id}`, { headers: { cookie } })
    ).text();

    const stage = html.slice(html.indexOf('id="stage"'));
    const editedAt = stage.indexOf('id="edited"');
    const resultAt = stage.indexOf('id="result"');
    assert.ok(editedAt !== -1, "the result image is on the page");
    assert.ok(
      editedAt < resultAt,
      "and it comes before the buttons, inside the stage"
    );
  } finally {
    app.stop();
    db.close();
  }
});

test("the stage sits in a box that can scroll, with zoom controls", async () => {
  const db = freshDb();
  const id = anImage(db, "a cat");
  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/edit/${id}`, { headers: { cookie } })
    ).text();

    assert.match(html, /id="zoom-out"/);
    assert.match(html, /id="zoom-in"/);
    assert.match(html, /id="zoom-level"[^>]*>\s*Fit/, "and it starts at Fit");

    const viewportAt = html.indexOf('id="viewport"');
    assert.ok(viewportAt !== -1, "there is a box to scroll");
    assert.ok(viewportAt < html.indexOf('id="stage"'), "and the stage is in it");
  } finally {
    app.stop();
    db.close();
  }
});

test("an image in the trash cannot be edited", async () => {
  const db = freshDb();
  const id = anImage(db, "a cat");
  models(db).Generation.trash(id);

  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const res = await fetch(`${app.base}/edit/${id}`, { headers: { cookie } });
    assert.equal(res.status, 404);
  } finally {
    app.stop();
    db.close();
  }
});

test("an id that names nothing is a 404, not a crash", async () => {
  const db = freshDb();
  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    for (const bad of ["9999", "0", "-1", "abc"]) {
      assert.equal(
        (await fetch(`${app.base}/edit/${bad}`, { headers: { cookie } })).status,
        404,
        `/edit/${bad}`
      );
    }
  } finally {
    app.stop();
    db.close();
  }
});

test("the page is behind the login", async () => {
  const db = freshDb();
  const id = anImage(db, "a cat");
  const app = await startApp(db);
  try {
    const res = await fetch(`${app.base}/edit/${id}`, { redirect: "manual" });
    assert.equal(res.status, 302);
    assert.match(res.headers.get("location"), /\/login/);
  } finally {
    app.stop();
    db.close();
  }
});

test("with no key the page says so and the button is disabled", async () => {
  const db = freshDb();
  const id = anImage(db, "a cat");
  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/edit/${id}`, { headers: { cookie } })
    ).text();
    assert.match(html, /No OpenAI API key/);
    assert.match(html, /id="edit-btn"[^>]*disabled/);
  } finally {
    app.stop();
    db.close();
  }
});

test("the page carries a wipe for comparing a result with the original", async () => {
  const db = freshDb();
  const id = anImage(db, "a cat");
  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/edit/${id}`, { headers: { cookie } })
    ).text();

    assert.match(html, /src="\/js\/wipe\.js"/, "the shared sums are loaded");

    const wipe = /<input[^>]*id="wipe"[^>]*>/.exec(html);
    assert.ok(wipe, "there is a slider");
    assert.match(wipe[0], /value="0"/, "which starts on the result");

    const row = /<div[^>]*id="wipe-row"[^>]*>/.exec(html);
    assert.ok(row, "the control has a row of its own");
    assert.match(row[0], /\shidden[\s>]/, "which ships hidden");
    assert.ok(
      !(/class="([^"]*)"/.exec(row[0]) || ["", ""])[1]
        .split(/\s+/)
        .includes("hidden"),
      "by the attribute, not a class"
    );
  } finally {
    app.stop();
    db.close();
  }
});

test("the page offers the four tools and a way to invert", async () => {
  const db = freshDb();
  const id = anImage(db, "a cat");
  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/edit/${id}`, { headers: { cookie } })
    ).text();

    for (const tool of ["brush", "rect", "ellipse", "eraser"]) {
      assert.match(html, new RegExp(`data-tool="${tool}"`), `${tool} is offered`);
    }

    assert.match(html, /data-tool="brush"[^>]*aria-pressed="true"/);
    assert.match(html, /id="invert-btn"[^>]*aria-pressed="false"/);
  } finally {
    app.stop();
    db.close();
  }
});

test("the four tools are drawn as icons with one hint between them", async () => {
  const db = freshDb();
  const id = anImage(db, "a cat");
  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/edit/${id}`, { headers: { cookie } })
    ).text();

    const tools = /data-tools[\s\S]*?<\/div>/.exec(html)[0];

    assert.equal((tools.match(/data-tool="/g) || []).length, 4);
    assert.match(tools, /fa-solid fa-paintbrush/);
    assert.match(tools, /fa-solid fa-eraser/);
    assert.match(html, /id="tool-hint"/);
  } finally {
    app.stop();
    db.close();
  }
});

test("the page loads the edit modules before the script that reads them", async () => {
  const db = freshDb();
  const id = anImage(db, "a cat");
  const app = await startApp(db);

  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/edit/${id}`, { headers: { cookie } })
    ).text();

    const at = (src) => html.indexOf(`/js/${src}`);

    for (const src of ["edit-geometry.js", "edit-strokes.js", "edit.js"]) {
      assert.ok(at(src) !== -1, `the page does not load ${src}`);
    }

    assert.ok(
      at("edit-geometry.js") < at("edit.js"),
      "edit-geometry.js must be loaded before edit.js"
    );
    assert.ok(
      at("edit-strokes.js") < at("edit.js"),
      "edit-strokes.js must be loaded before edit.js"
    );
    assert.ok(at("ui.js") < at("edit.js"), "ui.js must be loaded before edit.js");
    assert.ok(at("api.js") < at("edit.js"), "api.js must be loaded before edit.js");
  } finally {
    app.stop();
  }
});
