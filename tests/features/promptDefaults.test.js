/**
 * Per-prompt default tests
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

function freshDb() {
  const db = new Database(":memory:");
  schema.init(db);
  return db;
}

function prompts(db) {
  return require("../../models/prompt")(db);
}

test("a fresh database has both default columns", () => {
  const names = freshDb()
    .prepare("PRAGMA table_info(prompts)")
    .all()
    .map((c) => c.name);

  assert.ok(names.includes("default_size"));
  assert.ok(names.includes("default_model"));
});

test("a prompt with no preference stores nothing", () => {
  const db = freshDb();
  const Prompt = prompts(db);
  const id = Prompt.add("A", "x");

  assert.equal(Prompt.get(id).default_size, null);
  assert.equal(Prompt.get(id).default_model, null);
});

test("a size and model round-trip through add and update", () => {
  const db = freshDb();
  const Prompt = prompts(db);
  const id = Number(Prompt.add("A", "x", null, { size: "1024x1536", model: "2" }));

  const row = Prompt.get(id);
  assert.equal(row.default_size, "1024x1536");
  assert.equal(row.default_model, "2");

  Prompt.update(id, "A", "x", null, { size: "1536x1024", model: "1.5" });
  assert.equal(Prompt.get(id).default_size, "1536x1024");
  assert.equal(Prompt.get(id).default_model, "1.5");

  Prompt.update(id, "A", "x", null, { size: "", model: "" });
  assert.equal(Prompt.get(id).default_size, null);
  assert.equal(Prompt.get(id).default_model, null);
});

test("a size or model the app does not offer is not stored", () => {
  const db = freshDb();
  const Prompt = prompts(db);

  const id = Number(
    Prompt.add("A", "x", null, { size: "9999x9999", model: "gpt-9" })
  );

  assert.equal(Prompt.get(id).default_size, null);
  assert.equal(Prompt.get(id).default_model, null);
});

test("the list queries carry the defaults", () => {
  const db = freshDb();
  const Prompt = prompts(db);
  Prompt.add("A", "x", null, { size: "1024x1536", model: "2" });

  assert.equal(Prompt.page({ limit: 10, offset: 0 })[0].default_size, "1024x1536");
  assert.equal(Prompt.all()[0].default_model, "2");
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

  const after = await fetch(`${base}/prompts`, { headers: { cookie } });
  const csrf = /name="_csrf" value="([^"]+)"/.exec(await after.text())[1];
  return { cookie, csrf };
}

test("the prompt form offers and saves the two defaults", async () => {
  const db = freshDb();
  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);

    const form = await (
      await fetch(`${app.base}/prompts/new`, { headers: { cookie } })
    ).text();
    assert.match(form, /name="default_size"/);
    assert.match(form, /name="default_model"/);
    assert.match(form, /Use the app default/);

    await fetch(`${app.base}/prompts`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", cookie },
      body: new URLSearchParams({
        _csrf: csrf,
        name: "Tall",
        prompt: "a tall thing",
        default_size: "1024x1536",
        default_model: "2",
      }).toString(),
      redirect: "manual",
    });

    const row = prompts(db).all()[0];
    assert.equal(row.default_size, "1024x1536");
    assert.equal(row.default_model, "2");
  } finally {
    app.stop();
    db.close();
  }
});

test("the generate page offers a model picker and each prompt's defaults", async () => {
  const db = freshDb();
  prompts(db).add("Tall", "a tall thing", null, {
    size: "1024x1536",
    model: "2",
  });

  const app = await startApp(db);
  try {
    const { cookie } = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/generate`, { headers: { cookie } })
    ).text();

    assert.match(html, /data-model-strip/, "a model picker exists");
    assert.match(html, /data-size="1024x1536"/);
    assert.match(html, /data-model="2"/);
    assert.equal(/Model:\s*gpt-image/.test(html), false);
  } finally {
    app.stop();
    db.close();
  }
});

test("the generate page carries what the variable boxes need", async () => {
  const db = freshDb();
  prompts(db).add("Sunset", "{color} sunset over {place}");

  const app = await startApp(db);
  try {
    const { cookie } = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/generate`, { headers: { cookie } })
    ).text();

    assert.match(html, /id="variables"/);
    assert.match(html, /src="\/js\/template\.js"/);
    assert.match(html, /src="\/js\/template-fields\.js"/);

    assert.match(html, /\{color\} sunset over \{place\}/);

    const beforePrompt =
      html.indexOf('id="variables"') < html.indexOf('id="prompt"');
    assert.ok(beforePrompt, "the boxes sit above the Prompt box");
  } finally {
    app.stop();
    db.close();
  }
});

test("exporting and importing preserves the defaults", async () => {
  const db = freshDb();
  prompts(db).add("Tall", "x", null, { size: "1024x1536", model: "2" });

  const app = await startApp(db);
  try {
    const { cookie } = await signIn(app.base);
    const file = await (
      await fetch(`${app.base}/prompts/export`, { headers: { cookie } })
    ).text();

    const other = freshDb();
    const otherApp = await startApp(other);
    try {
      const second = await signIn(otherApp.base);
      const form = new FormData();
      form.set("_csrf", second.csrf);
      form.set("file", new Blob([file], { type: "application/json" }), "p.json");
      await fetch(`${otherApp.base}/prompts/import`, {
        method: "POST",
        headers: { cookie: second.cookie, "x-csrf-token": second.csrf },
        body: form,
      });

      const row = prompts(other).all()[0];
      assert.equal(row.default_size, "1024x1536");
      assert.equal(row.default_model, "2");
    } finally {
      otherApp.stop();
      other.close();
    }
  } finally {
    app.stop();
    db.close();
  }
});

test("the edit form shows the stored defaults as selected", async () => {
  const db = freshDb();
  const id = Number(
    prompts(db).add("Tall", "x", null, { size: "1024x1536", model: "2" })
  );

  const app = await startApp(db);
  try {
    const { cookie } = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/prompts/${id}/edit`, { headers: { cookie } })
    ).text();

    assert.match(html, /value="1024x1536"[^>]*selected/);
    assert.match(html, /value="2"[^>]*selected/);
  } finally {
    app.stop();
    db.close();
  }
});
