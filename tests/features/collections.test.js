/**
 * Collection tests
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
const { attrTag } = require("../helpers/dom");
const { COLLECTION_PREFIX } = require("../../config/urls");

const NOW = "2026-08-10T10:00:00.000Z";

function freshDb() {
  const db = new Database(":memory:");
  schema.init(db);
  return db;
}

function models(db) {
  return require("../../models").buildModels(db);
}

function anImage(db, prompt) {
  const { Generation } = models(db);
  return Number(
    Generation.add({
      filename: prompt + ".png",
      prompt,
      model: "gpt-image-2",
      size: "1024x1024",
    })
  );
}

test("both tables exist on a fresh database", () => {
  const db = freshDb();
  const names = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((r) => r.name);

  assert.ok(names.includes("collections"));
  assert.ok(names.includes("generation_collections"));
});

test("a collection is added, renamed, and listed in name order", () => {
  const { Collection } = models(freshDb());

  const zed = Collection.add("Zed work", NOW);
  Collection.add("Acme rebrand", NOW);
  assert.ok(zed);

  assert.deepEqual(
    Collection.all().map((c) => c.name),
    ["Acme rebrand", "Zed work"]
  );

  assert.equal(Collection.rename(zed, "Zed rebrand"), true);
  assert.equal(Collection.get(zed).name, "Zed rebrand");
});

test("a duplicate name is refused whatever its case", () => {
  const { Collection } = models(freshDb());
  Collection.add("Logos", NOW);

  assert.equal(Collection.add("logos", NOW), null);
  assert.equal(Collection.add("  LOGOS  ", NOW), null);
  assert.equal(Collection.add("", NOW), null);
});

test("an empty collection reports zero images", () => {
  const { Collection } = models(freshDb());
  Collection.add("Empty", NOW);
  assert.equal(Collection.all()[0].images, 0);
});

test("an image is filed, counted, and read back", () => {
  const db = freshDb();
  const { Collection } = models(db);
  const id = anImage(db, "a cat");
  const work = Collection.add("Client work", NOW);
  const best = Collection.add("Best of 2026", NOW);

  Collection.addImage(id, work);
  Collection.addImage(id, best);

  assert.deepEqual(
    Collection.ofImage(id).map((c) => c.name),
    ["Best of 2026", "Client work"],
    "in name order, so the chips do not move about"
  );
  assert.equal(Collection.all().find((c) => c.id === work).images, 1);
});

test("filing the same image twice leaves one row", () => {
  const db = freshDb();
  const { Collection } = models(db);
  const id = anImage(db, "a cat");
  const work = Collection.add("Client work", NOW);

  Collection.addImage(id, work);
  Collection.addImage(id, work);

  assert.equal(Collection.ofImage(id).length, 1);
  assert.equal(Collection.all()[0].images, 1);
});

test("an image is taken back out again", () => {
  const db = freshDb();
  const { Collection } = models(db);
  const id = anImage(db, "a cat");
  const work = Collection.add("Client work", NOW);

  Collection.addImage(id, work);
  Collection.removeImage(id, work);
  assert.deepEqual(Collection.ofImage(id), []);

  Collection.removeImage(id, work);
  assert.deepEqual(Collection.ofImage(id), []);
});

test("deleting a collection keeps the images", () => {
  const db = freshDb();
  const { Collection, Generation } = models(db);
  const id = anImage(db, "a cat");
  const work = Collection.add("Client work", NOW);
  Collection.addImage(id, work);

  Collection.remove(work);

  assert.ok(Generation.get(id), "the image survives");
  assert.deepEqual(Collection.ofImage(id), []);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM generation_collections").get().n,
    0,
    "and leaves no row pointing at a collection that is gone"
  );
});

test("clearImage drops every collection an image was in", () => {
  const db = freshDb();
  const { Collection } = models(db);
  const id = anImage(db, "a cat");
  const keep = anImage(db, "a dog");
  const work = Collection.add("Client work", NOW);

  Collection.addImage(id, work);
  Collection.addImage(keep, work);
  Collection.clearImage(id);

  assert.deepEqual(Collection.ofImage(id), []);
  assert.equal(Collection.ofImage(keep).length, 1, "the other image is untouched");
});

test("the chips for a whole page come back grouped by image", () => {
  const db = freshDb();
  const { Collection } = models(db);
  const one = anImage(db, "a cat");
  const two = anImage(db, "a dog");
  anImage(db, "a fish");
  const work = Collection.add("Client work", NOW);
  const best = Collection.add("Best of 2026", NOW);

  Collection.addImage(one, work);
  Collection.addImage(one, best);
  Collection.addImage(two, work);

  const map = Collection.forImages([one, two]);
  assert.deepEqual(
    map[one].map((c) => c.name),
    ["Best of 2026", "Client work"]
  );
  assert.deepEqual(
    map[two].map((c) => c.name),
    ["Client work"]
  );
  assert.equal(map[3], undefined, "an image in nothing simply has no entry");
  assert.deepEqual(Collection.forImages([]), {}, "an empty page asks for nothing");
});

test("adding many images at once reports how many were new", () => {
  const db = freshDb();
  const { Collection } = models(db);
  const one = anImage(db, "a cat");
  const two = anImage(db, "a dog");
  const work = Collection.add("Client work", NOW);

  assert.equal(Collection.addImages([one, two], work), 2);
  assert.equal(Collection.addImages([one, two], work), 0);
  assert.equal(Collection.all()[0].images, 2);
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

  const after = await fetch(`${base}/collections`, { headers: { cookie } });
  const csrf = /name="_csrf" value="([^"]+)"/.exec(await after.text())[1];
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

async function collectionsHtml({ shared = false } = {}) {
  const db = freshDb();
  const { Collection } = models(db);
  Collection.add("Unshared draft", NOW);
  const work = Collection.add("Client work", NOW);
  if (shared) Collection.share(work, "Winter campaign", () => "SHAREDTOK1");

  const app = await startApp(db);
  const { cookie } = await signIn(app.base);
  const res = await fetch(`${app.base}/collections`, { headers: { cookie } });
  const html = await res.text();
  return { html, stop: app.stop, db };
}

test("the collections page adds, renames, and deletes", async () => {
  const db = freshDb();
  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);
    const { Collection } = models(db);

    await post(app.base, "/collections", cookie, {
      _csrf: csrf,
      name: "Client work",
    });
    assert.equal(Collection.all()[0].name, "Client work");

    const id = Collection.all()[0].id;
    await post(app.base, `/collections/${id}`, cookie, {
      _csrf: csrf,
      name: "Acme rebrand",
    });
    assert.equal(Collection.all()[0].name, "Acme rebrand");

    const html = await (
      await fetch(`${app.base}/collections`, { headers: { cookie } })
    ).text();
    assert.match(html, /Acme rebrand/);
    assert.match(html, /Collections/);

    await post(app.base, `/collections/${id}/delete`, cookie, { _csrf: csrf });
    assert.deepEqual(Collection.all(), []);
  } finally {
    app.stop();
    db.close();
  }
});

test("a duplicate name is refused on the page, not saved", async () => {
  const db = freshDb();
  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);
    await post(app.base, "/collections", cookie, { _csrf: csrf, name: "Logos" });

    const res = await post(app.base, "/collections", cookie, {
      _csrf: csrf,
      name: "logos",
    });

    assert.equal(res.status, 400);
    assert.match(await res.text(), /already/i);
    assert.equal(models(db).Collection.all().length, 1);
  } finally {
    app.stop();
    db.close();
  }
});

test("the nav offers Collections", async () => {
  const db = freshDb();
  const app = await startApp(db);
  try {
    const { cookie } = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/generations`, { headers: { cookie } })
    ).text();
    assert.match(html, /href="\/collections"/);
  } finally {
    app.stop();
    db.close();
  }
});

test("the cards show which collections each image is in", async () => {
  const db = freshDb();
  const { Collection } = models(db);
  const one = anImage(db, "a cat");
  anImage(db, "a dog");
  const work = Collection.add("Client work", NOW);
  const best = Collection.add("Best of 2026", NOW);
  Collection.addImage(one, work);
  Collection.addImage(one, best);

  const app = await startApp(db);
  try {
    const { cookie } = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/generations`, { headers: { cookie } })
    ).text();

    assert.match(html, /data-collection-chip[^>]*data-collection-id="1"/);
    assert.match(html, /Client work/);
    assert.match(html, /Best of 2026/);
  } finally {
    app.stop();
    db.close();
  }
});

test("deleting an image takes it out of every collection", async () => {
  const db = freshDb();
  const { Collection } = models(db);
  const doomed = anImage(db, "a cat");
  const keep = anImage(db, "a dog");
  const work = Collection.add("Client work", NOW);
  Collection.addImage(doomed, work);
  Collection.addImage(keep, work);

  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);
    await post(app.base, `/generations/${doomed}/delete`, cookie, { _csrf: csrf });

    assert.equal(Collection.all()[0].images, 1);
    assert.equal(Collection.ofImage(keep).length, 1);
  } finally {
    app.stop();
    db.close();
  }
});

test("bulk delete takes them out of every collection too", async () => {
  const db = freshDb();
  const { Collection } = models(db);
  const one = anImage(db, "a cat");
  const two = anImage(db, "a dog");
  const work = Collection.add("Client work", NOW);
  Collection.addImages([one, two], work);

  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);
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

    assert.equal(Collection.all()[0].images, 0);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM generation_collections").get().n,
      2
    );
  } finally {
    app.stop();
    db.close();
  }
});

function callCard(base, cookie, csrf, path) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "x-csrf-token": csrf, cookie },
  });
}

test("the card endpoints file an image and take it out again", async () => {
  const db = freshDb();
  const { Collection } = models(db);
  const id = anImage(db, "a cat");
  const work = Collection.add("Client work", NOW);
  const best = Collection.add("Best of 2026", NOW);

  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);

    let body = await (
      await callCard(
        app.base,
        cookie,
        csrf,
        `/generations/${id}/collections/${work}`
      )
    ).json();
    assert.deepEqual(
      body.collections.map((c) => c.name),
      ["Client work"]
    );

    body = await (
      await callCard(
        app.base,
        cookie,
        csrf,
        `/generations/${id}/collections/${best}`
      )
    ).json();
    assert.deepEqual(
      body.collections.map((c) => c.name),
      ["Best of 2026", "Client work"],
      "the reply is the whole current list, so the chips redraw from truth"
    );

    body = await (
      await callCard(
        app.base,
        cookie,
        csrf,
        `/generations/${id}/collections/${work}/remove`
      )
    ).json();
    assert.deepEqual(
      body.collections.map((c) => c.name),
      ["Best of 2026"]
    );
  } finally {
    app.stop();
    db.close();
  }
});

test("filing the same image twice is not an error", async () => {
  const db = freshDb();
  const { Collection } = models(db);
  const id = anImage(db, "a cat");
  const work = Collection.add("Client work", NOW);

  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);
    const path = `/generations/${id}/collections/${work}`;
    await callCard(app.base, cookie, csrf, path);
    const res = await callCard(app.base, cookie, csrf, path);

    assert.equal(res.status, 200);
    assert.equal((await res.json()).collections.length, 1);
  } finally {
    app.stop();
    db.close();
  }
});

test("an unknown image or collection is refused", async () => {
  const db = freshDb();
  const { Collection } = models(db);
  const id = anImage(db, "a cat");
  const work = Collection.add("Client work", NOW);

  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);

    const gone = await callCard(
      app.base,
      cookie,
      csrf,
      `/generations/${id}/collections/9999`
    );
    assert.equal(gone.status, 404);

    const noImage = await callCard(
      app.base,
      cookie,
      csrf,
      `/generations/9999/collections/${work}`
    );
    assert.equal(noImage.status, 404);
    assert.equal(Collection.all()[0].images, 0);
  } finally {
    app.stop();
    db.close();
  }
});

test("the card offers every collection to add", async () => {
  const db = freshDb();
  const { Collection } = models(db);
  anImage(db, "a cat");
  Collection.add("Client work", NOW);

  const app = await startApp(db);
  try {
    const { cookie } = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/generations`, { headers: { cookie } })
    ).text();

    assert.match(html, /data-collection-add/);
    assert.match(html, /src="\/js\/collections\.js"/);
  } finally {
    app.stop();
    db.close();
  }
});

test("an image in three collections is still one row", () => {
  const db = freshDb();
  const { Collection, Generation } = models(db);
  const id = anImage(db, "a cat");
  anImage(db, "a dog");

  const a = Collection.add("A", NOW);
  const b = Collection.add("B", NOW);
  const c = Collection.add("C", NOW);
  [a, b, c].forEach((cid) => Collection.addImage(id, cid));

  const rows = Generation.page({ collectionId: a, limit: 50, offset: 0 });
  assert.equal(rows.length, 1);
  assert.equal(Generation.count({ collectionId: a }), 1);
  assert.equal(
    Generation.count({ collectionId: a }),
    Generation.page({ collectionId: a, limit: 50, offset: 0 }).length,
    "the count has to match the rows, because it drives pagination"
  );
});

test("none finds the images filed nowhere", () => {
  const db = freshDb();
  const { Collection, Generation } = models(db);
  const filed = anImage(db, "a cat");
  anImage(db, "a dog");
  const work = Collection.add("Client work", NOW);
  Collection.addImage(filed, work);

  const rows = Generation.page({ collectionId: "none", limit: 50, offset: 0 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].prompt, "a dog");
  assert.equal(Generation.count({ collectionId: "none" }), 1);
});

test("an unknown collection finds nothing rather than everything", () => {
  const db = freshDb();
  const { Generation } = models(db);
  anImage(db, "a cat");

  assert.equal(Generation.count({ collectionId: 9999 }), 0);
});

test("the collection filter combines with search and favourites", () => {
  const db = freshDb();
  const { Collection, Generation } = models(db);
  const cat = anImage(db, "a cat");
  const dog = anImage(db, "a dog");
  const work = Collection.add("Client work", NOW);
  Collection.addImage(cat, work);
  Collection.addImage(dog, work);

  assert.equal(
    Generation.count({ collectionId: work, search: "%cat%" }),
    1,
    "the conditions are ANDed, not replaced"
  );
});

test("a link keeps the collection when you turn the page", () => {
  const { pageLink } = require("../../utils/http/pageLink");
  assert.match(pageLink("/generations", 2, { collection: "3" }), /collection=3/);
});

test("the filter is offered and narrows the page", async () => {
  const db = freshDb();
  const { Collection } = models(db);
  const cat = anImage(db, "a cat");
  anImage(db, "a dog");
  const work = Collection.add("Client work", NOW);
  Collection.addImage(cat, work);

  const app = await startApp(db);
  try {
    const { cookie } = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/generations?collection=${work}`, {
        headers: { cookie },
      })
    ).text();

    assert.match(html, /name="collection"/);
    assert.match(html, /a cat/);
    assert.equal(/a dog/.test(html), false, "the other image is filtered out");
  } finally {
    app.stop();
    db.close();
  }
});

test("a selection is filed in one go", async () => {
  const db = freshDb();
  const { Collection } = models(db);
  const one = anImage(db, "a cat");
  const two = anImage(db, "a dog");
  anImage(db, "a fish");
  const work = Collection.add("Client work", NOW);

  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);
    const res = await fetch(`${app.base}/generations/bulk-collect`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", cookie },
      body: new URLSearchParams([
        ["_csrf", csrf],
        ["collectionId", String(work)],
        ["ids", String(one)],
        ["ids", String(two)],
      ]).toString(),
      redirect: "manual",
    });

    assert.equal(res.status, 302, "bulk-collect is its own route, not an image id");
    assert.equal(Collection.all()[0].images, 2);
    assert.equal(Collection.ofImage(one).length, 1);
  } finally {
    app.stop();
    db.close();
  }
});

test("bulk filing with nothing ticked or no collection changes nothing", async () => {
  const db = freshDb();
  const { Collection } = models(db);
  const one = anImage(db, "a cat");
  const work = Collection.add("Client work", NOW);

  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);

    await post(app.base, "/generations/bulk-collect", cookie, {
      _csrf: csrf,
      collectionId: String(work),
    });
    assert.equal(Collection.all()[0].images, 0, "no ids");

    await post(app.base, "/generations/bulk-collect", cookie, {
      _csrf: csrf,
      ids: String(one),
    });
    assert.equal(Collection.all()[0].images, 0, "no collection");

    await post(app.base, "/generations/bulk-collect", cookie, {
      _csrf: csrf,
      ids: String(one),
      collectionId: "9999",
    });
    assert.equal(Collection.all()[0].images, 0, "a collection that is gone");
  } finally {
    app.stop();
    db.close();
  }
});

test("the toolbar offers filing the selection", async () => {
  const db = freshDb();
  anImage(db, "a cat");
  models(db).Collection.add("Client work", NOW);

  const app = await startApp(db);
  try {
    const { cookie } = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/generations`, { headers: { cookie } })
    ).text();
    assert.match(html, /name="collectionId"/);
  } finally {
    app.stop();
    db.close();
  }
});

test("no collection name reaches the public pages", async () => {
  const db = freshDb();
  const { Collection, Generation, Settings } = models(db);
  Settings.update({ public_share: 1, public_gallery: 1 });

  const id = anImage(db, "a cat");
  const work = Collection.add("Acme Corp rebrand", NOW);
  Collection.addImage(id, work);
  Generation.share(id, () => "TESTTOKEN1");

  const app = await startApp(db);
  try {
    for (const path of ["/gallery", "/s/TESTTOKEN1"]) {
      const res = await fetch(`${app.base}${path}`);
      const html = await res.text();
      assert.equal(res.status, 200, `${path} should be public here`);
      assert.equal(
        /Acme Corp rebrand/.test(html),
        false,
        `${path} must not name a collection`
      );
    }
  } finally {
    app.stop();
    db.close();
  }
});

test("a shared collection publishes its title and never its name", async () => {
  const db = freshDb();
  const { Collection, Settings } = models(db);
  Settings.update({ public_collections: 1 });

  const id = anImage(db, "a cat");
  const work = Collection.add("Acme Corp rebrand", NOW);
  Collection.addImage(id, work);
  const token = Collection.share(work, "Winter campaign", () => "SHAREDTOK1");

  const app = await startApp(db);
  try {
    for (const path of [`/c/${token}`, `/c/${token}/i/${id}`]) {
      const html = await (await fetch(`${app.base}${path}`)).text();
      assert.match(html, /Winter campaign/, `${path} shows the public title`);
      assert.equal(
        /Acme Corp rebrand/.test(html),
        false,
        `${path} must not name the collection`
      );
    }
  } finally {
    app.stop();
    db.close();
  }
});

test("a shared collection shows its link and a way to copy it", async () => {
  const { html, stop, db } = await collectionsHtml({ shared: true });
  try {
    const shareUrl = `${COLLECTION_PREFIX}/SHAREDTOK1`;

    assert.match(html, /class="[^"]*pill-green/);

    const copyBtn = attrTag(html, "data-copy", "button");
    assert.ok(copyBtn, "a copy button is on the page");
    assert.match(copyBtn, new RegExp(`data-copy="${shareUrl}"`));
    assert.match(copyBtn, /fa-regular fa-copy/);

    const link = attrTag(html, "font-mono", "a");
    assert.ok(link, "the shared row shows its link");
    assert.match(link, new RegExp(`href="${shareUrl}"`));
    assert.match(link, new RegExp(`>${shareUrl}<`));
  } finally {
    stop();
    db.close();
  }
});

test("no collections yet shows the empty state", async () => {
  const db = freshDb();
  const app = await startApp(db);
  try {
    const { cookie } = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/collections`, { headers: { cookie } })
    ).text();

    assert.match(html, /No collections yet\./);
  } finally {
    app.stop();
    db.close();
  }
});
