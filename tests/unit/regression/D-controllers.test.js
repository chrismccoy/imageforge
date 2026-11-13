/**
 * Regression: trash, settings, named lists, collections (group D)
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { freshDb, startApp, signIn, PNG_BYTES } = require("../../helpers/app");
const { buildModels } = require("../../../models");
const buildTrash = require("../../../controllers/trashController");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "forge-d-"));
}

function anImage(Generation, dir, name) {
  const filename = `${process.pid}-${name}.png`;
  fs.writeFileSync(path.join(dir, filename), PNG_BYTES);
  return Generation.add({ filename, prompt: name, model: "gpt-image-2" });
}

async function csrfOf(base, cookie, from) {
  const html = await (
    await fetch(`${base}${from}`, { headers: { cookie } })
  ).text();
  return /name="_csrf" value="([^"]+)"/.exec(html)[1];
}

function post(base, route, cookie, fields) {
  return fetch(`${base}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams(fields).toString(),
    redirect: "manual",
  });
}

/**
 * A signed-in app over a fresh database and its own uploads folder.
 */
async function withApp(run) {
  const db = freshDb();
  const dir = tempDir();
  const app = await startApp({ db, folders: { uploadDir: dir } });
  try {
    const cookie = await signIn(app.base);
    await run({ db, dir, base: app.base, cookie, models: buildModels(db) });
  } finally {
    app.stop();
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("emptying the trash destroys only what the confirmation listed", async () => {
  await withApp(async ({ dir, base, cookie, models: { Generation } }) => {
    const shown = anImage(Generation, dir, "shown");
    const late = anImage(Generation, dir, "late");
    Generation.trash(shown);

    const csrf = await csrfOf(base, cookie, "/trash");
    const asked = await post(base, "/trash/empty", cookie, { _csrf: csrf });
    const page = await asked.text();
    assert.match(page, new RegExp(`name="ids" value="${shown}"`));

    Generation.trash(late);
    await post(base, "/trash/empty", cookie, [
      ["_csrf", csrf],
      ["confirm", "1"],
      ["ids", String(shown)],
    ]);

    assert.equal(Generation.getAnyState(shown), null, "the listed one went");
    assert.ok(
      Generation.getAnyState(late),
      "the unlisted one is still in the trash"
    );
  });
});

test("the empty-trash question says 1 image, not 1 images", async () => {
  await withApp(async ({ dir, base, cookie, models: { Generation } }) => {
    Generation.trash(anImage(Generation, dir, "only"));

    const csrf = await csrfOf(base, cookie, "/trash");
    const html = await (
      await post(base, "/trash/empty", cookie, { _csrf: csrf })
    ).text();
    assert.match(html, /Destroy 1 image\?/);
  });
});

test("the cached size is dropped only after the files are gone", async () => {
  const db = freshDb();
  const dir = tempDir();
  try {
    const models = buildModels(db);
    const seen = [];
    let watching = [];
    const usage = {
      quotaBytes: 1000,
      bytes: async () => 0,
      forget: () => seen.push(watching.map((f) => fs.existsSync(f))),
    };
    const ctrl = buildTrash({ models, usage, folders: { uploadDir: dir } });
    const res = { redirect() {} };

    const one = anImage(models.Generation, dir, "one");
    const two = anImage(models.Generation, dir, "two");
    const three = anImage(models.Generation, dir, "three");
    [one, two, three].forEach((id) => models.Generation.trash(id));
    const file = (id) => path.join(dir, models.Generation.getAnyState(id).filename);

    watching = [file(one)];
    await ctrl.purge({ params: { id: String(one) } }, res);

    watching = [file(two), file(three)];
    await ctrl.empty(
      { body: { confirm: "1", ids: [String(two), String(three)] } },
      res
    );

    assert.ok(seen.length >= 2);
    seen.forEach((existed) =>
      assert.ok(
        existed.every((e) => e === false),
        "forget ran after the unlink"
      )
    );
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a refused settings form is a 400 that keeps what was typed", async () => {
  await withApp(async ({ base, cookie, models: { Settings } }) => {
    const csrf = await csrfOf(base, cookie, "/settings");
    const res = await post(base, "/settings", cookie, {
      _csrf: csrf,
      public_gallery: "on",
      page_size: "37",
      brand_name: "Typed Name",
      api_key: "sk-typed-secret-123",
    });
    const html = await res.text();

    assert.equal(res.status, 400);
    assert.match(html, /gallery needs public sharing/i);
    assert.match(html, /id="page_size"[^>]*value="37"/);
    assert.match(html, /value="Typed Name"/);
    assert.doesNotMatch(html, /sk-typed-secret-123/, "the key is never echoed");
    assert.match(html, /name="public_gallery"[^>]*checked/);
    assert.equal(Settings.get().page_size, 0, "nothing was saved");
  });
});

test("a half-filled price pair is refused by the settings form", async () => {
  await withApp(async ({ base, cookie, models: { Settings, ModelPrice } }) => {
    const { MODEL_TOKENS } = require("../../../config/images");
    const token = MODEL_TOKENS[0];
    const csrf = await csrfOf(base, cookie, "/settings");
    const res = await post(base, "/settings", cookie, {
      _csrf: csrf,
      page_size: "12",
      [`price_in_${token}`]: "",
      [`price_out_${token}`]: "40",
    });

    assert.equal(res.status, 400);
    assert.match(await res.text(), /both an input and an output price/);
    assert.deepEqual(ModelPrice.all(), {}, "not saved as free");
    assert.equal(Settings.get().page_size, 0);
  });
});

test("a stored API key can be removed from the settings page", async () => {
  await withApp(async ({ base, cookie, models: { Settings } }) => {
    let csrf = await csrfOf(base, cookie, "/settings");
    await post(base, "/settings", cookie, { _csrf: csrf, api_key: "sk-stored-1" });
    assert.equal(Settings.get().api_key, "sk-stored-1");

    const html = await (
      await fetch(`${base}/settings`, { headers: { cookie } })
    ).text();
    assert.match(html, /name="clear_api_key"/, "the page offers the control");

    csrf = await csrfOf(base, cookie, "/settings");
    await post(base, "/settings", cookie, { _csrf: csrf, clear_api_key: "on" });
    assert.equal(Settings.get().api_key, "");
  });
});

test("the settings page loads ui before copy-link", async () => {
  await withApp(async ({ base, cookie }) => {
    const html = await (
      await fetch(`${base}/settings`, { headers: { cookie } })
    ).text();
    const ui = html.indexOf('src="/js/ui.js"');
    const copy = html.indexOf('src="/js/copy-link.js"');
    assert.ok(ui !== -1, "ui is loaded");
    assert.ok(copy > ui, "before copy-link");
  });
});

test("a blank name is told it needs a name, not that it is taken", async () => {
  await withApp(async ({ base, cookie, models: { Category, Collection } }) => {
    for (const route of ["/categories", "/collections"]) {
      const csrf = await csrfOf(base, cookie, route);
      const res = await post(base, route, cookie, { _csrf: csrf, name: "  " });
      const html = await res.text();
      assert.equal(res.status, 400);
      assert.match(html, /Give it a name\./, route);
      assert.doesNotMatch(html, /already/, route);
    }

    const cat = Category.add("Cat", new Date().toISOString());
    const col = Collection.add("Col", new Date().toISOString());
    for (const route of [`/categories/${cat}`, `/collections/${col}`]) {
      const csrf = await csrfOf(base, cookie, route.replace(/\/\d+$/, ""));
      const res = await post(base, route, cookie, { _csrf: csrf, name: "" });
      assert.equal(res.status, 400);
      assert.match(await res.text(), /Give it a name\./, route);
    }
  });
});

test("bulk collect files only live saved images", async () => {
  await withApp(async ({ db, dir, base, cookie, models }) => {
    const { Generation, Collection } = models;
    const live = anImage(Generation, dir, "live");
    const trashed = anImage(Generation, dir, "trashed");
    Generation.trash(trashed);
    const col = Collection.add("Mine", new Date().toISOString());

    const csrf = await csrfOf(base, cookie, "/generations");
    await post(base, "/generations/bulk-collect", cookie, [
      ["_csrf", csrf],
      ["collectionId", String(col)],
      ["ids", String(live)],
      ["ids", String(trashed)],
      ["ids", "9999"],
    ]);

    const filed = db
      .prepare(
        "SELECT generation_id FROM generation_collections WHERE collection_id = ? ORDER BY generation_id"
      )
      .all(col)
      .map((row) => row.generation_id);
    assert.deepEqual(filed, [live]);
  });
});
