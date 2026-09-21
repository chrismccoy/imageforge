/**
 * Trash tests
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
const fs = require("fs");
const { createApp } = require("../../server");
const { uploadPath } = require("../../utils/files/uploads");
const { attrTag } = require("../helpers/dom");
const { UPLOAD_DIR } = require("../../config/paths");

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

function withFiles(rows) {
  const written = rows.map((row) => uploadPath(row.filename, UPLOAD_DIR).full);
  written.forEach((full) => fs.writeFileSync(full, PNG));
  return () =>
    written.forEach((full) => {
      try {
        fs.unlinkSync(full);
      } catch (err) {
        if (err.code !== "ENOENT") throw err;
      }
    });
}

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
      filename: `${process.pid}-${prompt.replace(/\s/g, "-")}.png`,
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

async function signInWithCsrf(base, from = "/generations") {
  const cookie = await signIn(base);
  const html = await (
    await fetch(`${base}${from}`, { headers: { cookie } })
  ).text();
  const csrf = /name="_csrf" value="([^"]+)"/.exec(html)[1];
  return { cookie, csrf };
}

function post(base, path, cookie, fields) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams(fields).toString(),
    redirect: "manual",
  });
}

async function trashHtml() {
  const db = freshDb();
  const id = anImage(db, "a cat");
  models(db).Generation.trash(id);

  const app = await startApp(db);
  const cookie = await signIn(app.base);
  const html = await (
    await fetch(`${app.base}/trash`, { headers: { cookie } })
  ).text();
  return { html, stop: app.stop, db };
}

test("a fresh database has the column and the view", () => {
  const db = freshDb();
  const cols = db
    .prepare("PRAGMA table_info(generations)")
    .all()
    .map((c) => c.name);
  assert.ok(cols.includes("deleted_at"));

  const views = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'view'")
    .all()
    .map((r) => r.name);
  assert.ok(views.includes("live_generations"));
});

test("the view is not writable, which is what keeps reads and writes apart", () => {
  const db = freshDb();
  assert.throws(
    () => db.prepare("UPDATE live_generations SET deleted_at = ?").run("x"),
    /cannot modify/
  );
});

test("trashing hides a row from the list without destroying it", () => {
  const db = freshDb();
  const { Generation } = models(db);
  const id = anImage(db, "a cat");
  anImage(db, "a dog");

  Generation.trash(id);

  assert.equal(Generation.count(), 1, "gone from the count");
  assert.equal(Generation.page({ limit: 50, offset: 0 }).length, 1);
  assert.equal(Generation.get(id), null, "and from a plain lookup");
  assert.equal(Generation.all().length, 1, "and from download-all");

  assert.ok(Generation.getAnyState(id), "the row survives");
  assert.equal(Generation.trashed().length, 1);
  assert.equal(Generation.trashed()[0].id, id);
});

test("restoring puts it back exactly as it was", () => {
  const db = freshDb();
  const { Generation, Collection } = models(db);
  const id = anImage(db, "a cat");
  const work = Collection.add("Client work", "2026-08-10T10:00:00.000Z");
  Collection.addImage(id, work);
  Generation.toggleFavorite(id);
  Generation.share(id, () => "KEEPTHISTK");

  Generation.trash(id);
  Generation.restore(id);

  const row = Generation.get(id);
  assert.ok(row, "back in the list");
  assert.equal(row.favorite, 1, "still starred");
  assert.equal(row.share_token, "KEEPTHISTK", "same link as before");
  assert.deepEqual(
    Collection.ofImage(id).map((c) => c.name),
    ["Client work"],
    "back in its collections"
  );
  assert.equal(Generation.trashed().length, 0);
});

test("purging destroys the row, and the caller clears its join rows", () => {
  const db = freshDb();
  const { Generation, Collection } = models(db);
  const id = anImage(db, "a cat");
  const keep = anImage(db, "a dog");
  const work = Collection.add("Client work", "2026-08-10T10:00:00.000Z");
  Collection.addImages([id, keep], work);

  Generation.trash(id);
  Collection.clearImage(id);
  Generation.purge(id);

  assert.equal(Generation.getAnyState(id), null, "the row is gone");
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM generation_collections WHERE generation_id = ?"
      )
      .get(id).n,
    0,
    "and so are its join rows"
  );
  assert.equal(Collection.all()[0].images, 1, "the count follows");
  assert.ok(Generation.get(keep), "the other image is untouched");
});

test("a trashed image falls out of every collection query", () => {
  const db = freshDb();
  const { Generation, Collection } = models(db);
  const gone = anImage(db, "a cat");
  const kept = anImage(db, "a dog");
  const work = Collection.add("Client work", "2026-08-10T10:00:00.000Z");
  Collection.addImages([gone, kept], work);

  Generation.trash(gone);

  assert.equal(Collection.all()[0].images, 1, "the count on the collections page");
  assert.equal(Collection.countImages(work), 1, "the pager's total");
  assert.equal(Collection.allImagesIn(work).length, 1, "the zip");
  assert.equal(
    Collection.imagesPage(work, { limit: 50, offset: 0 }).length,
    1,
    "the public grid"
  );
  assert.deepEqual(Collection.ofImage(gone), [], "its own chips");
  assert.equal(
    Collection.forImages([gone, kept])[gone],
    undefined,
    "the page's chips"
  );
  assert.equal(Collection.holds(work, gone), false, "containment");
  assert.equal(Collection.holds(work, kept), true);
});

test("a trashed image is not reachable by its share token", () => {
  const db = freshDb();
  const { Generation } = models(db);
  const id = anImage(db, "a cat");
  Generation.share(id, () => "SHAREDTOK1");

  assert.ok(Generation.getByShareToken("SHAREDTOK1"));
  Generation.trash(id);
  assert.equal(Generation.getByShareToken("SHAREDTOK1"), null);
  assert.equal(Generation.countShared(), 0, "nor counted by the gallery");
  assert.equal(
    Generation.pageShared({ limit: 50, offset: 0 }).length,
    0,
    "nor listed by it"
  );
});

test("usage and cost keep counting a trashed image", () => {
  const db = freshDb();
  const { Generation, Stats } = models(db);
  const id = Number(
    Generation.add({
      filename: "a.png",
      prompt: "a cat",
      model: "gpt-image-2",
      usage: { total: 1000, input: 100, output: 900 },
    })
  );

  const before = Stats.byModel();
  Generation.trash(id);

  assert.deepEqual(Stats.byModel(), before);
  assert.equal(Stats.total(), 1);
});

test("usage and cost survive purging an image, not just trashing it", () => {
  const db = freshDb();
  const { Generation, Stats } = models(db);
  const id = Number(
    Generation.add({
      filename: "a.png",
      prompt: "a cat",
      model: "gpt-image-2",
      usage: { total: 1000, input: 100, output: 900 },
    })
  );

  const before = Stats.byModel();
  assert.equal(before[0].images, 1);

  Generation.trash(id);
  Generation.purge(id);

  assert.equal(Generation.count(), 0, "the image is gone");
  assert.deepEqual(
    Stats.byModel(),
    before,
    "what it cost is not gone with it — money paid is not refunded by a delete"
  );
});

test("the ledger keeps counting as images come and go", () => {
  const db = freshDb();
  const { Generation, Stats } = models(db);
  const usage = { total: 1000, input: 100, output: 900 };

  const first = Number(Generation.add({ filename: "a.png", model: "m", usage }));
  Generation.purge(first);
  Generation.add({ filename: "b.png", model: "m", usage });

  const row = Stats.byModel()[0];
  assert.equal(row.images, 2, "both were made, whatever became of them");
  assert.equal(row.inputTokens, 200);
  assert.equal(row.outputTokens, 1800);
});

test("a prompt's uses count does not count trashed images", () => {
  const db = freshDb();
  const { Prompt, Generation } = models(db);
  const id = Prompt.add("Sunsets", "a sunset");
  const gone = anImage(db, "a sunset", id);
  anImage(db, "another sunset", id);

  assert.equal(Prompt.all()[0].uses, 2);
  Generation.trash(gone);
  assert.equal(Prompt.all()[0].uses, 1);
  assert.equal(Generation.count({ promptId: id }), 1);
});

test("deleting an image trashes it and keeps the file", async () => {
  const db = freshDb();
  const { Generation } = models(db);
  const id = anImage(db, "a cat");
  const cleanUp = withFiles([Generation.getAnyState(id)]);

  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signInWithCsrf(app.base);
    await post(app.base, `/generations/${id}/delete`, cookie, { _csrf: csrf });

    assert.equal(Generation.get(id), null, "out of the list");
    assert.ok(Generation.getAnyState(id), "but not destroyed");
    assert.ok(
      fs.existsSync(
        uploadPath(Generation.getAnyState(id).filename, UPLOAD_DIR).full
      ),
      "and the file is still on disk, or restore could not work"
    );
  } finally {
    app.stop();
    cleanUp();
    db.close();
  }
});

test("bulk delete trashes the selection", async () => {
  const db = freshDb();
  const { Generation } = models(db);
  const one = anImage(db, "a cat");
  const two = anImage(db, "a dog");
  anImage(db, "a fish");
  const cleanUp = withFiles([one, two].map((id) => Generation.getAnyState(id)));

  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signInWithCsrf(app.base);
    await fetch(`${app.base}/generations/bulk-delete`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", cookie },
      body: new URLSearchParams([
        ["_csrf", csrf],
        ["confirm", "1"],
        ["ids", String(one)],
        ["ids", String(two)],
      ]).toString(),
      redirect: "manual",
    });

    assert.equal(Generation.count(), 1);
    assert.equal(Generation.trashed().length, 2);
    assert.ok(
      fs.existsSync(
        uploadPath(Generation.getAnyState(one).filename, UPLOAD_DIR).full
      ),
      "the files survive a bulk delete too"
    );
  } finally {
    app.stop();
    cleanUp();
    db.close();
  }
});

test("the bulk confirm no longer threatens what it will not do", async () => {
  const db = freshDb();
  const id = anImage(db, "a cat");

  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signInWithCsrf(app.base);
    const res = await post(app.base, "/generations/bulk-delete", cookie, {
      _csrf: csrf,
      ids: String(id),
    });
    const html = await res.text();

    assert.equal(/cannot be undone/i.test(html), false);
    assert.match(html, /trash/i);
  } finally {
    app.stop();
    db.close();
  }
});

test("the trash lists what is in it, and restores one", async () => {
  const db = freshDb();
  const { Generation } = models(db);
  const id = anImage(db, "a cat");
  Generation.trash(id);

  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signInWithCsrf(app.base, "/trash");
    const html = await (
      await fetch(`${app.base}/trash`, { headers: { cookie } })
    ).text();
    assert.match(html, /a cat/);

    await post(app.base, `/trash/${id}/restore`, cookie, { _csrf: csrf });
    assert.ok(Generation.get(id), "back in the list");
    assert.equal(Generation.trashed().length, 0);
  } finally {
    app.stop();
    db.close();
  }
});

test("purging one destroys its file and its row", async () => {
  const db = freshDb();
  const { Generation } = models(db);
  const id = anImage(db, "a cat");
  const row = Generation.getAnyState(id);
  const cleanUp = withFiles([row]);
  Generation.trash(id);

  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signInWithCsrf(app.base, "/trash");
    await post(app.base, `/trash/${id}/purge`, cookie, { _csrf: csrf });

    assert.equal(Generation.getAnyState(id), null, "the row is gone");
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(
      fs.existsSync(uploadPath(row.filename, UPLOAD_DIR).full),
      false,
      "and the file"
    );
  } finally {
    app.stop();
    cleanUp();
    db.close();
  }
});

test("a live image cannot be purged by a stray post", async () => {
  const db = freshDb();
  const { Generation } = models(db);
  const id = anImage(db, "a cat");
  const cleanUp = withFiles([Generation.getAnyState(id)]);

  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signInWithCsrf(app.base, "/trash");
    await post(app.base, `/trash/${id}/purge`, cookie, { _csrf: csrf });

    assert.ok(Generation.get(id), "the live image is untouched");
  } finally {
    app.stop();
    cleanUp();
    db.close();
  }
});

test("emptying the trash asks first, then takes everything in it", async () => {
  const db = freshDb();
  const { Generation } = models(db);
  const one = anImage(db, "a cat");
  const two = anImage(db, "a dog");
  const live = anImage(db, "a fish");
  const cleanUp = withFiles(
    [one, two, live].map((id) => Generation.getAnyState(id))
  );
  Generation.trash(one);
  Generation.trash(two);

  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signInWithCsrf(app.base, "/trash");

    const asked = await post(app.base, "/trash/empty", cookie, { _csrf: csrf });
    assert.match(await asked.text(), /2/, "it says how many first");
    assert.equal(Generation.trashed().length, 2, "and has not done it yet");

    await post(app.base, "/trash/empty", cookie, { _csrf: csrf, confirm: "1" });
    assert.equal(Generation.trashed().length, 0);
    assert.ok(Generation.get(live), "a live image is untouched");
  } finally {
    app.stop();
    cleanUp();
    db.close();
  }
});

test("emptying the trash is the page's one loud button", async () => {
  const { html, stop, db } = await trashHtml();
  try {
    const button = attrTag(html, "btn-danger", "button");
    assert.match(button, /Empty trash/);
    assert.match(button, /fa-solid fa-fire/);
  } finally {
    stop();
    db.close();
  }
});

test("an empty trash says so", async () => {
  const db = freshDb();
  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/trash`, { headers: { cookie } })
    ).text();
    assert.match(html, /nothing in the trash/i);
  } finally {
    app.stop();
    db.close();
  }
});

test("the sidebar offers Trash", async () => {
  const db = freshDb();
  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/generations`, { headers: { cookie } })
    ).text();
    assert.match(html, /href="\/trash"/);
  } finally {
    app.stop();
    db.close();
  }
});

test("a trashed image is gone from every surface at once", async () => {
  const db = freshDb();
  const { Generation, Collection, Settings } = models(db);
  Settings.update({ public_share: 1, public_gallery: 1, public_collections: 1 });

  const gone = anImage(db, "should vanish");
  const kept = anImage(db, "should remain");
  const work = Collection.add("Client work", "2026-08-10T10:00:00.000Z");
  Collection.addImages([gone, kept], work);
  Generation.share(gone, () => "GONETOKEN1");
  const cToken = Collection.share(work, "Winter campaign", () => "COLLTOKEN1");
  const cleanUp = withFiles([gone, kept].map((id) => Generation.getAnyState(id)));

  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    Generation.trash(gone);

    const signedIn = (p) => fetch(`${app.base}${p}`, { headers: { cookie } });
    const out = (p) => fetch(`${app.base}${p}`);

    const list = await (await signedIn("/generations")).text();
    assert.equal(/should vanish/.test(list), false, "the list");
    assert.match(list, /should remain/);
    assert.match(list, /1 saved/, "the count");

    const filtered = await (
      await signedIn(`/generations?collection=${work}`)
    ).text();
    assert.equal(/should vanish/.test(filtered), false, "the collection filter");

    const collections = await (await signedIn("/collections")).text();
    assert.match(collections, />1</, "the collection's own count");

    const zipAll = await signedIn("/generations/download-all");
    const allBytes = Buffer.from(await zipAll.bytes()).toString("latin1");
    assert.equal(allBytes.includes("should-vanish.png"), false, "download-all");
    assert.ok(allBytes.includes("should-remain.png"));

    assert.equal((await out("/s/GONETOKEN1")).status, 404, "its share page");
    assert.equal((await out("/i/GONETOKEN1")).status, 404, "its share image");

    const gallery = await (await out("/gallery")).text();
    assert.equal(/GONETOKEN1/.test(gallery), false, "the gallery");

    const grid = await (await out(`/c/${cToken}`)).text();
    assert.equal(
      new RegExp(`/i/${gone}\\.png`).test(grid),
      false,
      "the shared collection's grid"
    );
    assert.match(grid, new RegExp(`/i/${kept}\\.png`));
    assert.match(grid, /1 image/, "and its count");

    assert.equal(
      (await out(`/c/${cToken}/i/${gone}`)).status,
      404,
      "its page there"
    );
    assert.equal(
      (await out(`/c/${cToken}/i/${gone}/file`)).status,
      404,
      "its bytes"
    );
    assert.equal(
      (await out(`/c/${cToken}/i/${gone}/download`)).status,
      404,
      "its download"
    );

    const zip = await out(`/c/${cToken}/download`);
    assert.equal(zip.status, 200);
    const bytes = Buffer.from(await zip.bytes()).toString("latin1");
    assert.equal(bytes.includes("should-vanish.png"), false, "the shared zip");
    assert.ok(bytes.includes("should-remain.png"));
  } finally {
    app.stop();
    cleanUp();
    db.close();
  }
});

test("restoring puts it back on every surface too", async () => {
  const db = freshDb();
  const { Generation, Collection, Settings } = models(db);
  Settings.update({ public_share: 1, public_collections: 1 });

  const id = anImage(db, "comes back");
  const work = Collection.add("Client work", "2026-08-10T10:00:00.000Z");
  Collection.addImage(id, work);
  Generation.share(id, () => "BACKTOKEN1");
  const cToken = Collection.share(work, "Winter campaign", () => "COLLTOKEN2");
  const cleanUp = withFiles([Generation.getAnyState(id)]);

  const app = await startApp(db);
  try {
    Generation.trash(id);
    assert.equal((await fetch(`${app.base}/s/BACKTOKEN1`)).status, 404);

    Generation.restore(id);
    assert.equal((await fetch(`${app.base}/s/BACKTOKEN1`)).status, 200);
    const grid = await (await fetch(`${app.base}/c/${cToken}`)).text();
    assert.match(grid, new RegExp(`/i/${id}\\.png`), "back in the shared grid");
  } finally {
    app.stop();
    cleanUp();
    db.close();
  }
});
