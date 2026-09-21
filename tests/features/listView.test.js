/**
 * Grid or list on the images page
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
const { buildModels } = require("../../models");
const buildController = require("../../controllers/generationsController");
const { pageLink } = require("../../utils/http/pageLink");
const { attrTag } = require("../helpers/dom");

function freshDb() {
  const db = new Database(":memory:");
  schema.init(db);
  return db;
}

test("a fresh database has the column, and starts on the grid", () => {
  const db = freshDb();
  const names = db
    .prepare("PRAGMA table_info(settings)")
    .all()
    .map((column) => column.name);

  assert.ok(names.includes("list_view"), "settings holds the preference");
  assert.equal(buildModels(db).Settings.get().list_view, 0);
});

test("the preference is stored and read back", () => {
  const { Settings } = buildModels(freshDb());
  Settings.update({ list_view: "1" });
  assert.equal(Settings.get().list_view, 1);

  Settings.update({ list_view: "" });
  assert.equal(Settings.get().list_view, 0);
});

test("saving anything else leaves the layout alone", () => {
  const { Settings } = buildModels(freshDb());
  Settings.update({ list_view: "1" });

  Settings.update({ page_size: "25" });

  assert.equal(Settings.get().list_view, 1, "the settings page did not touch it");
  assert.equal(Settings.get().page_size, 25);
});

function setup() {
  const db = freshDb();
  const models = buildModels(db);
  const access = require("../../services/publicAccess").createPublicAccess(
    models.Settings
  );
  return { db, models, ctrl: buildController({ models, access }) };
}

function recordingRes() {
  return {
    rendered: null,
    redirectedTo: null,
    render(view, data) {
      this.rendered = { view, data };
      return this;
    },
    redirect(to) {
      this.redirectedTo = to;
      return this;
    },
  };
}

function show(ctrl, models, query = {}) {
  const res = recordingRes();
  ctrl.index({ query, params: {}, settings: models.Settings.get() }, res);
  return res.rendered.data;
}

test("the page follows the stored preference", () => {
  const { models, ctrl } = setup();
  assert.equal(show(ctrl, models).view, "grid");

  models.Settings.update({ list_view: "1" });
  assert.equal(show(ctrl, models).view, "list");
});

test("a link may ask for the other layout for one visit", () => {
  const { models, ctrl } = setup();

  assert.equal(show(ctrl, models, { view: "list" }).view, "list");
  assert.equal(models.Settings.get().list_view, 0, "and asking does not store it");
});

test("a layout nobody offers falls back to what is stored", () => {
  const { models, ctrl } = setup();
  models.Settings.update({ list_view: "1" });
  assert.equal(show(ctrl, models, { view: "spiral" }).view, "list");
});

test("choosing a layout stores it and comes back to the same page", () => {
  const { models, ctrl } = setup();
  const res = recordingRes();

  ctrl.setView(
    {
      body: { view: "list", q: "cat", page: "3" },
      settings: models.Settings.get(),
    },
    res
  );

  assert.equal(models.Settings.get().list_view, 1);
  assert.equal(res.redirectedTo, "/generations/page/3?q=cat");
});

test("the layout a link carries survives paging", () => {
  assert.equal(
    pageLink("/generations", 2, { q: "cat", view: "list" }),
    "/generations/page/2?q=cat&view=list"
  );
});

test("a made up layout is not echoed back into the page's own links", () => {
  const { models, ctrl } = setup();
  const data = show(ctrl, models, { view: "<script>" });

  assert.equal(data.view, "grid");
  for (const url of [data.nextUrl, data.prevUrl, data.favUrl]) {
    assert.doesNotMatch(url, /script/);
  }
});

const { startApp, signIn, uploadFixture, csrfFor } = require("../helpers/app");

async function listPage(query = "") {
  const db = freshDb();
  const fixture = uploadFixture();
  const { Generation, Collection } = buildModels(db);
  Generation.add({
    filename: fixture.filename,
    prompt: "a cat on a wall",
    model: "gpt-image-2",
    size: "1024x1024",
  });
  Collection.add("Client work", new Date().toISOString());

  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const res = await fetch(`${app.base}/generations${query}`, {
      headers: { cookie },
    });
    return await res.text();
  } finally {
    app.stop();
    fixture.remove();
    db.close();
  }
}

const HOOKS = [
  "data-generation-card",
  "data-gen-id",
  "data-favorite",
  "data-bulk-cell",
  "data-collections",
  "data-list-grid",
];

test("the list layout keeps every hook the grid has", async () => {
  const grid = await listPage("?view=grid");
  const list = await listPage("?view=list");

  for (const hook of HOOKS) {
    assert.match(grid, new RegExp(hook), `grid has ${hook}`);
    assert.match(list, new RegExp(hook), `list keeps ${hook}`);
  }
});

test("the page offers the layout it is not showing", async () => {
  const grid = await listPage("?view=grid");
  assert.match(grid, /name="view" value="list"/, "grid offers the list");

  const list = await listPage("?view=list");
  assert.match(list, /name="view" value="grid"/, "list offers the grid");
});

test("choosing a layout is a post, so following a link cannot store one", async () => {
  const html = await listPage();
  const form = /<form[^>]*action="\/generations\/view"[^>]*>/.exec(html);
  assert.ok(form, "there is a form for it");
  assert.match(form[0], /method="post"/);
});

test("the stored layout is what an unadorned visit shows", async () => {
  const db = freshDb();
  const fixture = uploadFixture();
  const { Settings, Generation } = buildModels(db);
  Settings.update({ list_view: 1 });
  Generation.add({
    filename: fixture.filename,
    prompt: "a cat",
    model: "gpt-image-2",
    size: "1024x1024",
  });

  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const csrf = await csrfFor(app.base, cookie);
    assert.ok(csrf, "the page carries a token, so the form can post");

    const html = await (
      await fetch(`${app.base}/generations`, { headers: { cookie } })
    ).text();
    assert.match(html, /name="view" value="grid"/, "it is showing the list");
  } finally {
    app.stop();
    fixture.remove();
    db.close();
  }
});

test("a layout asked for in a link is kept while paging through", () => {
  const { models, ctrl } = setup();
  const data = show(ctrl, models, { view: "list", q: "cat" });

  assert.match(data.nextUrl, /view=list/, "the ask survives the pager");
});

test("a stored layout is not written into every link on the page", () => {
  const { models, ctrl } = setup();
  models.Settings.update({ list_view: 1 });
  const data = show(ctrl, models);

  assert.equal(data.view, "list", "it is showing the list");
  assert.doesNotMatch(
    data.nextUrl,
    /view=/,
    "but an address passed to somebody else does not rearrange their page"
  );
});

test("a row shows the prompt, which is what a list is for", async () => {
  const list = await listPage("?view=list");
  assert.match(
    list,
    /data-row-prompt[^>]*>\s*a cat on a wall/,
    "the prompt is written on the row"
  );

  const grid = await listPage("?view=grid");
  assert.doesNotMatch(grid, /data-row-prompt/, "the grid does not repeat it");
  assert.match(grid, /data-prompt-show/, "the grid still offers it on demand");
  assert.match(list, /data-prompt-show/, "and so does the list");
});

test("the filters are drawn as one bar", async () => {
  const html = await listPage();
  const bar = attrTag(html, "filter-bar", "div");
  assert.ok(bar, "the generations filter bar itself");
  assert.match(bar, /name="q"/);
  assert.match(bar, /name="collection"/);
  assert.match(bar, /href="[^"]*fav=1"/);
});

test("a card keeps every attribute the scripts read", async () => {
  const html = await listPage();
  for (const attribute of [
    "data-generation-card",
    "data-gen-id",
    "data-favorite",
    "data-bulk-cell",
    "data-collections",
    "data-collection-add",
    "data-prompt-show",
    "data-confirm",
    "data-confirm-open",
  ]) {
    assert.match(html, new RegExp(attribute), `${attribute} is gone`);
  }
});

test("a card offers no collection picker when there are no collections", async () => {
  const db = freshDb();
  const fixture = uploadFixture();
  const { Generation } = buildModels(db);
  Generation.add({
    filename: fixture.filename,
    prompt: "a cat with nowhere to be filed",
    model: "gpt-image-2",
    size: "1024x1024",
  });

  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/generations`, { headers: { cookie } })
    ).text();
    assert.doesNotMatch(html, /data-collection-add/);
  } finally {
    app.stop();
    fixture.remove();
    db.close();
  }
});

test("the view switch, download and new-generation buttons render inside the page-head row", async () => {
  const html = await listPage();
  const h1 = html.indexOf("<h1");
  const rowClose = html.indexOf("<span data-page-head-end");
  assert.notEqual(h1, -1, "no h1");
  assert.notEqual(rowClose, -1, "no page-head row close marker");

  const after = h1 + "<h1".length;
  const relative = html.slice(after).search(/List view|Grid view/);
  const viewSwitch = relative === -1 ? -1 : relative + after;
  const downloadAll = html.indexOf("/generations/download-all", after);
  const newGeneration = html.indexOf("New generation", after);

  for (const [name, at] of [
    ["the view switch", viewSwitch],
    ["Download all", downloadAll],
    ["New generation", newGeneration],
  ]) {
    assert.notEqual(at, -1, `${name} is missing`);
    assert.ok(at > h1 && at < rowClose, `${name} is not inside the page-head row`);
  }
});
