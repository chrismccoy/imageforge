/**
 * Bulk select tests
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
const path = require("path");
const Database = require("better-sqlite3");

const schema = require("../../db/schema");
const { createApp } = require("../../server");
const { UPLOAD_DIR } = require("../../config/paths");

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

  const after = await fetch(`${base}/generations`, { headers: { cookie } });
  const csrf = /name="_csrf" value="([^"]+)"/.exec(await after.text())[1];
  return { cookie, csrf };
}

const PNG = Buffer.from("PNGBYTES");
const written = [];

function addImage(db, name) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const filename = `bulk-${process.pid}-${name}.png`;
  const full = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(full, PNG);
  written.push(full);

  const Generation = require("../../models/generation")(db);
  return Number(Generation.add({ filename, prompt: name, size: "" }));
}

test.after(() => {
  for (const full of written) {
    try {
      fs.unlinkSync(full);
    } catch (_err) {
    }
  }
});

function post(base, cookie, target, fields) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    for (const one of Array.isArray(value) ? value : [value]) body.append(key, one);
  }
  return fetch(`${base}${target}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie },
    body: body.toString(),
    redirect: "manual",
  });
}

test("bulk delete asks first and changes nothing", async () => {
  const db = freshDb();
  const a = addImage(db, "a");
  const b = addImage(db, "b");
  addImage(db, "c");

  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);
    const res = await post(app.base, cookie, "/generations/bulk-delete", {
      _csrf: csrf,
      ids: [String(a), String(b)],
    });

    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /2/, "the count is named");
    assert.match(html, /name="confirm" value="1"/);

    assert.equal(
      require("../../models/generation")(db).count(),
      3,
      "nothing gone yet"
    );
  } finally {
    app.stop();
    db.close();
  }
});

test("confirming trashes the chosen rows and keeps their files", async () => {
  const db = freshDb();
  const a = addImage(db, "d");
  const b = addImage(db, "e");
  const keep = addImage(db, "f");

  const Generation = require("../../models/generation")(db);
  const goneFile = path.join(UPLOAD_DIR, Generation.get(a).filename);

  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);
    const res = await post(app.base, cookie, "/generations/bulk-delete", {
      _csrf: csrf,
      confirm: "1",
      ids: [String(a), String(b)],
    });

    assert.equal(res.status, 302);
    assert.equal(Generation.count(), 1);
    assert.ok(Generation.get(keep), "the unselected row survives");
    assert.equal(Generation.get(a), null, "and the chosen ones leave the list");

    assert.ok(Generation.getAnyState(a), "the row is kept for restoring");
    assert.equal(Generation.trashed().length, 2);
    assert.equal(fs.existsSync(goneFile), true, "and so is its file");
  } finally {
    app.stop();
    db.close();
  }
});

test("a row whose file is already gone is still removed", async () => {
  const db = freshDb();
  const a = addImage(db, "g");
  const Generation = require("../../models/generation")(db);
  fs.unlinkSync(path.join(UPLOAD_DIR, Generation.get(a).filename));

  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);
    await post(app.base, cookie, "/generations/bulk-delete", {
      _csrf: csrf,
      confirm: "1",
      ids: String(a),
    });

    assert.equal(Generation.count(), 0, "a missing file must not strand the row");
  } finally {
    app.stop();
    db.close();
  }
});

test("selecting nothing goes back to the list without a confirmation", async () => {
  const db = freshDb();
  addImage(db, "h");

  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);
    const res = await post(app.base, cookie, "/generations/bulk-delete", {
      _csrf: csrf,
    });

    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/generations");
    assert.equal(require("../../models/generation")(db).count(), 1);
  } finally {
    app.stop();
    db.close();
  }
});

test("bulk download zips only the chosen images", async () => {
  const db = freshDb();
  const a = addImage(db, "i");
  addImage(db, "j");

  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);
    const res = await fetch(`${app.base}/generations/bulk-download`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", cookie },
      body: new URLSearchParams({ _csrf: csrf, ids: String(a) }).toString(),
    });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/zip");
    assert.match(
      res.headers.get("content-disposition"),
      /attachment; filename="image-forge-selected-\d{4}-\d{2}-\d{2}\.zip"/
    );

    const body = Buffer.from(await res.arrayBuffer());
    assert.equal(body.subarray(0, 2).toString(), "PK");
    assert.ok(body.length > 0);
  } finally {
    app.stop();
    db.close();
  }
});

test("bulk download with nothing selected goes back to the list", async () => {
  const db = freshDb();
  addImage(db, "k");

  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);
    const res = await post(app.base, cookie, "/generations/bulk-download", {
      _csrf: csrf,
    });

    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/generations");
  } finally {
    app.stop();
    db.close();
  }
});

test("bulk deleting prompts detaches their images rather than deleting them", async () => {
  const db = freshDb();
  const Prompt = require("../../models/prompt")(db);
  const Generation = require("../../models/generation")(db);

  const keepMe = Prompt.add("Keep", "x");
  const goA = Prompt.add("Go A", "x");
  const goB = Prompt.add("Go B", "x");
  Generation.add({ filename: "kept.png", prompt: "x", prompt_id: goA, size: "" });

  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);

    const asked = await post(app.base, cookie, "/prompts/bulk-delete", {
      _csrf: csrf,
      ids: [String(goA), String(goB)],
    });
    assert.equal(asked.status, 200);
    assert.equal(Prompt.count(), 3);

    const done = await post(app.base, cookie, "/prompts/bulk-delete", {
      _csrf: csrf,
      confirm: "1",
      ids: [String(goA), String(goB)],
    });
    assert.equal(done.status, 302);

    assert.equal(Prompt.count(), 1);
    assert.ok(Prompt.get(keepMe));

    const rows = Generation.all();
    assert.equal(rows.length, 1);
    assert.equal(Generation.get(rows[0].id).prompt_id, null);
  } finally {
    app.stop();
    db.close();
  }
});

test("the generations page offers checkboxes tied to a toolbar form", async () => {
  const db = freshDb();
  addImage(db, "l");

  const app = await startApp(db);
  try {
    const { cookie } = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/generations`, { headers: { cookie } })
    ).text();

    assert.match(html, /id="bulk-generations"/);
    assert.match(html, /name="ids"[^>]*form="bulk-generations"/);
    assert.match(html, /formaction="\/generations\/bulk-delete"/);
    assert.match(html, /formaction="\/generations\/bulk-download"/);
    assert.match(html, /src="\/js\/bulk\.js"/);
  } finally {
    app.stop();
    db.close();
  }
});

test("the prompts page offers checkboxes tied to its own toolbar form", async () => {
  const db = freshDb();
  require("../../models/prompt")(db).add("A", "x");

  const app = await startApp(db);
  try {
    const { cookie } = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/prompts`, { headers: { cookie } })
    ).text();

    assert.match(html, /id="bulk-prompts"/);
    assert.match(html, /name="ids"[^>]*form="bulk-prompts"/);
    assert.match(html, /formaction="\/prompts\/bulk-delete"/);
  } finally {
    app.stop();
    db.close();
  }
});

test("no form is nested inside another on either list", async () => {
  const db = freshDb();
  addImage(db, "m");
  require("../../models/prompt")(db).add("A", "x");

  const app = await startApp(db);
  try {
    const { cookie } = await signIn(app.base);

    for (const page of ["/generations", "/prompts"]) {
      const html = await (
        await fetch(`${app.base}${page}`, { headers: { cookie } })
      ).text();

      let depth = 0;
      let worst = 0;
      for (const tag of html.match(/<\/?form\b/g) || []) {
        depth += tag === "<form" ? 1 : -1;
        worst = Math.max(worst, depth);
      }
      assert.equal(worst, 1, `${page} nests forms, which browsers mishandle`);
      assert.equal(depth, 0, `${page} has an unclosed form`);
    }
  } finally {
    app.stop();
    db.close();
  }
});
