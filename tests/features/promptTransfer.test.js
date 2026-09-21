/**
 * Prompt transfer tests
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";

const test = require("node:test");
const assert = require("node:assert/strict");

const { toExport, parseImport } = require("../../utils/domain/promptTransfer");
const {
  MAX_ENTRIES: IMPORT_MAX_ENTRIES,
} = require("../../utils/domain/promptTransfer");

const NOW = "2026-08-10T08:30:00.000Z";

test("an export carries a version, a date, and every prompt", () => {
  const file = toExport(
    [
      { name: "Logos", prompt: "a mark", category_name: "logos", rating: 4 },
      { name: "Hills", prompt: "a hill", category_name: null, rating: null },
    ],
    NOW
  );

  assert.equal(file.version, 1);
  assert.equal(file.exported_at, NOW);
  assert.deepEqual(file.prompts, [
    {
      name: "Logos",
      prompt: "a mark",
      category: "logos",
      rating: 4,
      default_size: null,
      default_model: null,
      notes: null,
    },
    {
      name: "Hills",
      prompt: "a hill",
      category: null,
      rating: null,
      default_size: null,
      default_model: null,
      notes: null,
    },
  ]);
});

test("an export carries each prompt's preferred size and model", () => {
  const file = toExport(
    [
      {
        name: "Tall",
        prompt: "x",
        category_name: null,
        rating: null,
        default_size: "1024x1536",
        default_model: "2",
      },
      { name: "Plain", prompt: "x", category_name: null, rating: null },
    ],
    NOW
  );

  assert.equal(file.prompts[0].default_size, "1024x1536");
  assert.equal(file.prompts[0].default_model, "2");
  assert.equal(file.prompts[1].default_size, null);
  assert.equal(file.prompts[1].default_model, null);
});

test("an import reads the defaults back", () => {
  const parsed = parseImport(
    JSON.stringify([
      { name: "Tall", prompt: "x", default_size: "1024x1536", default_model: "2" },
    ])
  );

  assert.equal(parsed.entries[0].defaultSize, "1024x1536");
  assert.equal(parsed.entries[0].defaultModel, "2");
});

test("an unusable default is dropped without losing the prompt", () => {
  const parsed = parseImport(
    JSON.stringify([
      { name: "A", prompt: "x", default_size: 42, default_model: {} },
      { name: "B", prompt: "x", default_size: "  ", default_model: "" },
    ])
  );

  assert.equal(parsed.entries.length, 2, "the prompt survives a bad preference");
  for (const entry of parsed.entries) {
    assert.equal(entry.defaultSize, null);
    assert.equal(entry.defaultModel, null);
  }
});

test("an export of nothing is still a valid file", () => {
  const file = toExport([], NOW);
  assert.deepEqual(file.prompts, []);
});

test("a file this app exported reads back unchanged", () => {
  const file = toExport(
    [{ name: "Logos", prompt: "a mark", category_name: "logos", rating: 4 }],
    NOW
  );

  const parsed = parseImport(JSON.stringify(file));
  assert.equal(parsed.ignored, 0);
  assert.deepEqual(parsed.entries, [
    {
      name: "Logos",
      prompt: "a mark",
      category: "logos",
      rating: 4,
      defaultSize: null,
      defaultModel: null,
      notes: null,
    },
  ]);
});

test("a bare array is accepted, because someone will hand-write one", () => {
  const parsed = parseImport('[{ "name": "A", "prompt": "x" }]');
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0].category, null);
  assert.equal(parsed.entries[0].rating, null);
});

test("an empty list is valid and imports nothing", () => {
  assert.deepEqual(parseImport("[]"), { entries: [], ignored: 0 });
  assert.deepEqual(parseImport('{"prompts":[]}'), { entries: [], ignored: 0 });
});

test("something that is not JSON is refused, not thrown", () => {
  for (const text of ["", "   ", "not json", "{", "<html></html>"]) {
    const parsed = parseImport(text);
    assert.ok(parsed.error, `${JSON.stringify(text)} should be refused`);
    assert.equal(parsed.entries, undefined);
  }
});

test("JSON of the wrong shape is refused", () => {
  for (const text of [
    '"a string"',
    "42",
    "null",
    "true",
    "{}",
    '{"prompts":"no"}',
  ]) {
    assert.ok(parseImport(text).error, `${text} should be refused`);
  }
});

test("an entry with no usable name or prompt is ignored, not fatal", () => {
  const parsed = parseImport(
    JSON.stringify([
      { name: "Good", prompt: "x" },
      { name: "", prompt: "x" },
      { name: "   ", prompt: "x" },
      { name: "No text", prompt: "" },
      { name: "No text either" },
      { prompt: "orphan" },
      { name: 42, prompt: "x" },
      null,
      "nonsense",
    ])
  );

  assert.deepEqual(
    parsed.entries.map((e) => e.name),
    ["Good"]
  );
  assert.equal(parsed.ignored, 8);
});

test("names and prompts are trimmed", () => {
  const parsed = parseImport('[{ "name": "  A  ", "prompt": "  x  " }]');
  assert.equal(parsed.entries[0].name, "A");
  assert.equal(parsed.entries[0].prompt, "x");
});

test("a rating outside one to five becomes unrated, keeping the prompt", () => {
  const parsed = parseImport(
    JSON.stringify([
      { name: "A", prompt: "x", rating: 0 },
      { name: "B", prompt: "x", rating: 6 },
      { name: "C", prompt: "x", rating: 2.5 },
      { name: "D", prompt: "x", rating: "4" },
      { name: "E", prompt: "x", rating: null },
      { name: "F", prompt: "x", rating: 3 },
    ])
  );

  assert.equal(parsed.entries.length, 6, "no prompt is lost over a bad score");
  assert.deepEqual(
    parsed.entries.map((e) => e.rating),
    [null, null, null, null, null, 3]
  );
});

test("a category that is not a non-empty string becomes none", () => {
  const parsed = parseImport(
    JSON.stringify([
      { name: "A", prompt: "x", category: 7 },
      { name: "B", prompt: "x", category: "  " },
      { name: "C", prompt: "x", category: "  logos  " },
    ])
  );

  assert.deepEqual(
    parsed.entries.map((e) => e.category),
    [null, null, "logos"]
  );
});

test("a file with more entries than the cap is refused whole", () => {
  const many = Array.from({ length: IMPORT_MAX_ENTRIES + 1 }, (_, i) => ({
    name: `P${i}`,
    prompt: "x",
  }));

  const parsed = parseImport(JSON.stringify(many));
  assert.ok(parsed.error, "refused rather than silently truncated");
  assert.match(parsed.error, new RegExp(String(IMPORT_MAX_ENTRIES)));
});

const Database = require("better-sqlite3");
const schema = require("../../db/schema");
const { createApp } = require("../../server");

function freshDb() {
  const db = new Database(":memory:");
  schema.init(db);
  return db;
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
  const cookie = cookieFrom(res) || loginCookie;

  const after = await fetch(`${base}/prompts`, { headers: { cookie } });
  const csrf = /name="csrf-token" content="([^"]*)"/.exec(await after.text())[1];
  return { cookie, csrf };
}

test("export sends every prompt as a download", async () => {
  const db = freshDb();
  const Category = require("../../models/category")(db);
  const Prompt = require("../../models/prompt")(db);
  const logos = Category.add("logos", NOW);
  const id = Prompt.add("Logos", "a mark", logos);
  Prompt.setRating(id, 4);
  Prompt.add("Hills", "a hill", null);

  const app = await startApp(db);
  try {
    const { cookie } = await signIn(app.base);
    const res = await fetch(`${app.base}/prompts/export`, { headers: { cookie } });

    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /application\/json/);
    assert.match(
      res.headers.get("content-disposition"),
      /attachment; filename="imageforge-prompts-\d{4}-\d{2}-\d{2}\.json"/
    );

    const file = await res.json();
    assert.equal(file.version, 1);
    assert.equal(file.prompts.length, 2);

    const logosEntry = file.prompts.find((p) => p.name === "Logos");
    assert.equal(logosEntry.category, "logos");
    assert.equal(logosEntry.rating, 4);
  } finally {
    app.stop();
    db.close();
  }
});

test("export ignores the current filter, because a backup must be whole", async () => {
  const db = freshDb();
  const Category = require("../../models/category")(db);
  const Prompt = require("../../models/prompt")(db);
  const logos = Category.add("logos", NOW);
  Prompt.add("Logos", "a mark", logos);
  Prompt.add("Hills", "a hill", null);

  const app = await startApp(db);
  try {
    const { cookie } = await signIn(app.base);
    const res = await fetch(
      `${app.base}/prompts/export?category=${logos}&q=logos`,
      { headers: { cookie } }
    );

    const file = await res.json();
    assert.equal(
      file.prompts.length,
      2,
      "a filtered backup would be worse than none"
    );
  } finally {
    app.stop();
    db.close();
  }
});

test("export needs a login", async () => {
  const db = freshDb();
  const app = await startApp(db);
  try {
    const res = await fetch(`${app.base}/prompts/export`, { redirect: "manual" });
    assert.equal(res.status, 302);
  } finally {
    app.stop();
    db.close();
  }
});

function importFile(base, cookie, csrf, contents, filename = "prompts.json") {
  const form = new FormData();
  form.set("_csrf", csrf);
  form.set("file", new Blob([contents], { type: "application/json" }), filename);
  return fetch(`${base}/prompts/import`, {
    method: "POST",
    headers: { cookie, "x-csrf-token": csrf },
    body: form,
  });
}

test("import adds new prompts, skips existing names, and creates categories", async () => {
  const db = freshDb();
  const Prompt = require("../../models/prompt")(db);
  Prompt.add("Hills", "an older hill", null);

  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);
    const file = JSON.stringify({
      version: 1,
      prompts: [
        { name: "Logos", prompt: "a mark", category: "logos", rating: 4 },
        { name: "Hills", prompt: "a hill", category: "hills", rating: 2 },
        { name: "", prompt: "junk" },
      ],
    });

    const res = await importFile(app.base, cookie, csrf, file);
    assert.equal(res.status, 200);
    const html = await res.text();

    assert.match(html, /Imported 1/);
    assert.match(html, /Skipped 1/);
    assert.match(html, /Ignored 1/);
    assert.match(html, /logos/);

    const hills = Prompt.all().find((p) => p.name === "Hills");
    assert.equal(hills.prompt, "an older hill", "nothing existing is overwritten");

    const logos = Prompt.all().find((p) => p.name === "Logos");
    assert.equal(logos.category_name, "logos");
    assert.equal(logos.rating, 4);

    assert.deepEqual(
      require("../../models/category")(db)
        .all()
        .map((c) => c.name),
      ["logos"]
    );
  } finally {
    app.stop();
    db.close();
  }
});

test("an existing name is matched whatever its case", async () => {
  const db = freshDb();
  require("../../models/prompt")(db).add("Logos", "mine", null);

  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);
    const res = await importFile(
      app.base,
      cookie,
      csrf,
      JSON.stringify([{ name: "LOGOS", prompt: "theirs" }])
    );

    assert.match(await res.text(), /Skipped 1/);
    assert.equal(require("../../models/prompt")(db).count(), 1);
  } finally {
    app.stop();
    db.close();
  }
});

test("a category that exists in another case is reused, not duplicated", async () => {
  const db = freshDb();
  require("../../models/category")(db).add("Logos", NOW);

  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);
    await importFile(
      app.base,
      cookie,
      csrf,
      JSON.stringify([{ name: "A", prompt: "x", category: "logos" }])
    );

    assert.equal(require("../../models/category")(db).all().length, 1);
  } finally {
    app.stop();
    db.close();
  }
});

test("a malformed file changes nothing and says why", async () => {
  const db = freshDb();
  require("../../models/prompt")(db).add("Hills", "a hill", null);

  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);

    for (const bad of ["not json at all", '"a string"', '{"nope":1}']) {
      const res = await importFile(app.base, cookie, csrf, bad);
      assert.equal(res.status, 400, `${bad} should be refused`);
      assert.match(await res.text(), /file/i);
    }

    assert.equal(
      require("../../models/prompt")(db).count(),
      1,
      "nothing was written"
    );
  } finally {
    app.stop();
    db.close();
  }
});

test("importing with no file chosen says so", async () => {
  const db = freshDb();
  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);
    const form = new FormData();
    form.set("_csrf", csrf);

    const res = await fetch(`${app.base}/prompts/import`, {
      method: "POST",
      headers: { cookie, "x-csrf-token": csrf },
      body: form,
    });

    assert.equal(res.status, 400);
    assert.match(await res.text(), /choose a file/i);
  } finally {
    app.stop();
    db.close();
  }
});

test("import needs a CSRF token, which middleware cannot check for multipart", async () => {
  const db = freshDb();
  const app = await startApp(db);
  try {
    const { cookie } = await signIn(app.base);
    const form = new FormData();
    form.set("file", new Blob(["[]"], { type: "application/json" }), "p.json");

    const res = await fetch(`${app.base}/prompts/import`, {
      method: "POST",
      headers: { cookie },
      body: form,
    });

    assert.equal(res.status, 403);
    assert.equal(require("../../models/prompt")(db).count(), 0);
  } finally {
    app.stop();
    db.close();
  }
});

test("import and export live on their own page, not the prompts list", async () => {
  const db = freshDb();
  const app = await startApp(db);
  try {
    const { cookie } = await signIn(app.base);

    const backup = await fetch(`${app.base}/prompts/backup`, {
      headers: { cookie },
    });
    const backupHtml = await backup.text();
    assert.equal(backup.status, 200);
    assert.match(backupHtml, /href="\/prompts\/export"/, "export is here");
    assert.match(backupHtml, /action="\/prompts\/import"/, "and so is import");

    const list = await (
      await fetch(`${app.base}/prompts`, { headers: { cookie } })
    ).text();
    assert.equal(
      /action="\/prompts\/import"/.test(list),
      false,
      "the list page no longer carries the import form"
    );
    assert.match(
      list,
      /href="\/prompts\/backup"/,
      "but it links to the page that does"
    );
  } finally {
    app.stop();
    db.close();
  }
});

test("an import reports its result on the backup page", async () => {
  const db = freshDb();
  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);
    const res = await importFile(
      app.base,
      cookie,
      csrf,
      JSON.stringify([{ name: "Hills", prompt: "a hill" }])
    );
    const html = await res.text();

    assert.equal(res.status, 200);
    assert.match(html, /Imported 1/);
    assert.match(html, /action="\/prompts\/import"/, "still on the backup page");
    assert.equal(require("../../models/prompt")(db).all().length, 1);
  } finally {
    app.stop();
    db.close();
  }
});

test("an import error reports on the backup page too", async () => {
  const db = freshDb();
  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);
    const res = await importFile(app.base, cookie, csrf, "not json at all");
    const html = await res.text();

    assert.equal(res.status, 400);
    assert.match(html, /not JSON/i);
    assert.match(html, /action="\/prompts\/import"/, "still on the backup page");
  } finally {
    app.stop();
    db.close();
  }
});
