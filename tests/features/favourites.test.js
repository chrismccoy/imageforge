/**
 * Favourites
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.PUBLIC_SHARE = "";
process.env.PUBLIC_GALLERY = "";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const buildGeneration = require("../../models/generation");
const { freshDb, startApp, signIn } = require("../helpers/app");

test("the favorite endpoint toggles and reports the new value", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const id = Generation.add({ filename: "a.png", prompt: "a cat", size: "" });

  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const page = await (
      await fetch(`${app.base}/generations`, { headers: { cookie } })
    ).text();
    const csrf = /name="csrf-token" content="([^"]*)"/.exec(page)[1];

    const post = () =>
      fetch(`${app.base}/generations/${id}/favorite`, {
        method: "POST",
        headers: { cookie, "x-csrf-token": csrf },
      });

    const on = await post();
    assert.equal(on.status, 200);
    assert.deepEqual(await on.json(), { favorite: 1 });
    assert.equal(Generation.get(id).favorite, 1);

    const off = await post();
    assert.deepEqual(await off.json(), { favorite: 0 });
    assert.equal(Generation.get(id).favorite, 0);
  } finally {
    app.stop();
    db.close();
  }
});

test("favoriting an unknown image is a 404", async () => {
  const db = freshDb();
  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const page = await (
      await fetch(`${app.base}/generations`, { headers: { cookie } })
    ).text();
    const csrf = /name="csrf-token" content="([^"]*)"/.exec(page)[1];

    const res = await fetch(`${app.base}/generations/9999/favorite`, {
      method: "POST",
      headers: { cookie, "x-csrf-token": csrf },
    });
    assert.equal(res.status, 404);
  } finally {
    app.stop();
    db.close();
  }
});

test("favoriting without a CSRF token is refused and changes nothing", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const id = Generation.add({ filename: "a.png", prompt: "a cat", size: "" });

  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const res = await fetch(`${app.base}/generations/${id}/favorite`, {
      method: "POST",
      headers: { cookie },
    });
    assert.equal(res.status, 403);
    assert.equal(Generation.get(id).favorite, 0);
  } finally {
    app.stop();
    db.close();
  }
});

test("the card shows a star reflecting whether the image is a favorite", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const starred = Generation.add({ filename: "a.png", prompt: "a cat", size: "" });
  Generation.add({ filename: "b.png", prompt: "a dog", size: "" });
  Generation.toggleFavorite(starred);

  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/generations`, { headers: { cookie } })
    ).text();

    assert.equal((html.match(/data-favorite/g) || []).length, 2);
    assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
    assert.match(html, /src="\/js\/favorite\.js"/);
  } finally {
    app.stop();
    db.close();
  }
});

test("the star button is not nested inside the link to the full image", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  Generation.add({ filename: "a.png", prompt: "a cat", size: "" });

  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/generations`, { headers: { cookie } })
    ).text();

    const anchor = /<a href="\/uploads\/[^"]*"[\s\S]*?<\/a>/.exec(html)[0];
    assert.equal(anchor.includes("data-favorite"), false);
  } finally {
    app.stop();
    db.close();
  }
});

test("the favorites filter narrows the list and composes with a search", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const a = Generation.add({
    filename: "a.png",
    prompt: "a Tokyo alley",
    size: "",
  });
  Generation.add({ filename: "b.png", prompt: "a Tokyo street", size: "" });
  const c = Generation.add({
    filename: "c.png",
    prompt: "a red bicycle",
    size: "",
  });
  Generation.toggleFavorite(a);
  Generation.toggleFavorite(c);

  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const get = (path) =>
      fetch(`${app.base}${path}`, { headers: { cookie } }).then((r) => r.text());

    const favs = await get("/generations?fav=1");
    assert.match(favs, /2 of 3/);

    const both = await get("/generations?q=tokyo&fav=1");
    assert.match(both, /1 of 3/);
    assert.match(both, /a Tokyo alley/);
    assert.equal(both.includes("a red bicycle"), false);
  } finally {
    app.stop();
    db.close();
  }
});

test("the favorites pill carries the search term and turns itself off", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const id = Number(
    Generation.add({ filename: "a.png", prompt: "a cat", size: "" })
  );
  Generation.toggleFavorite(id);

  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const get = (path) =>
      fetch(`${app.base}${path}`, { headers: { cookie } }).then((r) => r.text());

    const off = await get("/generations?q=cat");
    assert.match(off, /href="\/generations\?q=cat&amp;fav=1"/);

    const on = await get("/generations?q=cat&fav=1");
    assert.match(on, /href="\/generations\?q=cat"/);
  } finally {
    app.stop();
    db.close();
  }
});

const FAVORITE_JS = path.join(__dirname, "..", "..", "public", "js", "favorite.js");

function loadFavorite() {
  const grid = { children: [] };
  const card = {
    remove() {
      grid.children = grid.children.filter((one) => one !== card);
    },
  };
  grid.children.push(card);

  const classes = new Set(["text-amber-400"]);
  const attrs = { "data-gen-id": "42", "aria-pressed": "true" };
  const listeners = {};
  const button = {
    disabled: false,
    classList: {
      toggle(cls, on) {
        if (on) classes.add(cls);
        else classes.delete(cls);
      },
      contains: (cls) => classes.has(cls),
    },
    setAttribute(name, value) {
      attrs[name] = String(value);
    },
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
    addEventListener(name, fn) {
      (listeners[name] = listeners[name] || []).push(fn);
    },
    closest: () => card,
  };

  const actionRow = { hidden: false };
  const filterBar = { hidden: false };
  const emptyState = { hidden: true };
  const bulkBar = { hidden: false };
  const favouritesView = {};

  const sandbox = {
    document: {
      querySelectorAll(selector) {
        if (selector === "[data-favorite]") return [button];
        if (selector === "[data-list-head]") return [actionRow, filterBar];
        return [];
      },
      querySelector(selector) {
        if (selector === "[data-favourites-view]") return favouritesView;
        if (selector === "[data-list-grid]") return grid;
        if (selector === "[data-empty-state]") return emptyState;
        return null;
      },
      getElementById: (id) => (id === "bulk-generations" ? bulkBar : null),
    },
    window: {
      ImageForgeApi: {
        post: () => Promise.resolve({ favorite: 0 }),
        notice() {},
      },
      ImageForgeUi: {
        show(el, on) {
          if (el) el.hidden = !on;
        },
      },
    },
    console,
  };
  sandbox.window.document = sandbox.document;
  vm.runInNewContext(fs.readFileSync(FAVORITE_JS, "utf8"), sandbox);

  return {
    grid,
    card,
    actionRow,
    filterBar,
    emptyState,
    bulkBar,
    unstar: async () => {
      for (const fn of listeners.click || []) await fn();
    },
  };
}

test("unstarring the last favourite hides both data-list-head regions", async () => {
  const page = loadFavorite();

  await page.unstar();

  assert.equal(page.card.remove !== undefined, true, "sanity: the card exists");
  assert.equal(page.grid.children.length, 0, "the card is gone");
  assert.equal(page.bulkBar.hidden, true);
  assert.equal(page.emptyState.hidden, false);
  assert.equal(page.actionRow.hidden, true, "the page-head action row hides");
  assert.equal(page.filterBar.hidden, true, "the filter bar hides");
});
