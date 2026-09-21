/**
 * Pagination tests
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const schema = require("../../../../db/schema");

const { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } = require("../../../../config/limits");

const { paginate } = require("../../../../utils/http/paginate");
const { resolvePageSize } = require("../../../../utils/http/pageRequest");

function freshDb() {
  const db = new Database(":memory:");
  schema.init(db);
  return db;
}

function fakeRes() {
  return {
    rendered: null,
    render(view, data) {
      this.rendered = { view, data };
      return this;
    },
  };
}

test("resolvePageSize: the saved setting wins when positive", () => {
  assert.equal(resolvePageSize(10, 50), 10);
});

test("resolvePageSize: falls back to the env value when the setting is unset", () => {
  assert.equal(resolvePageSize(0, 40), 40);
  assert.equal(resolvePageSize("", 40), 40);
});

test("resolvePageSize: falls back to the default when neither is set", () => {
  assert.equal(resolvePageSize(0, 0), DEFAULT_PAGE_SIZE);
});

test("resolvePageSize: clamps above the max", () => {
  assert.equal(resolvePageSize(9999, 0), MAX_PAGE_SIZE);
});

test("paginate: a page in range keeps its offset", () => {
  assert.deepEqual(paginate({ total: 5, pageSize: 2, rawPage: "2" }), {
    page: 2,
    totalPages: 3,
    offset: 2,
  });
});

test("paginate: junk, missing, or below range input falls back to page 1", () => {
  const first = { page: 1, totalPages: 3, offset: 0 };
  assert.deepEqual(paginate({ total: 5, pageSize: 2, rawPage: "abc" }), first);
  assert.deepEqual(paginate({ total: 5, pageSize: 2, rawPage: undefined }), first);
  assert.deepEqual(paginate({ total: 5, pageSize: 2, rawPage: "0" }), first);
  assert.deepEqual(paginate({ total: 5, pageSize: 2, rawPage: "-4" }), first);
});

test("paginate: a page past the end clamps to the last page", () => {
  assert.deepEqual(paginate({ total: 5, pageSize: 2, rawPage: "99" }), {
    page: 3,
    totalPages: 3,
    offset: 4,
  });
});

test("paginate: an empty list still reports one page", () => {
  assert.deepEqual(paginate({ total: 0, pageSize: 24, rawPage: "3" }), {
    page: 1,
    totalPages: 1,
    offset: 0,
  });
});

test("generation model: count and page slice newest first", () => {
  const db = freshDb();
  const Generation = require("../../../../models/generation")(db);
  for (let i = 1; i <= 5; i++) Generation.add({ filename: `f${i}.png` });

  assert.equal(Generation.count(), 5);

  assert.deepEqual(
    Generation.page({ limit: 2, offset: 0 }).map((r) => r.filename),
    ["f5.png", "f4.png"]
  );
  assert.deepEqual(
    Generation.page({ limit: 2, offset: 2 }).map((r) => r.filename),
    ["f3.png", "f2.png"]
  );
  assert.deepEqual(
    Generation.page({ limit: 2, offset: 4 }).map((r) => r.filename),
    ["f1.png"]
  );
});

test("prompt model: count and page slice in case insensitive name order", () => {
  const db = freshDb();
  const Prompt = require("../../../../models/prompt")(db);
  ["delta", "Alpha", "charlie", "Bravo"].forEach((name) =>
    Prompt.add(name, `${name} text`)
  );

  assert.equal(Prompt.count(), 4);

  assert.deepEqual(
    Prompt.page({ limit: 2, offset: 0 }).map((r) => r.name),
    ["Alpha", "Bravo"]
  );
  assert.deepEqual(
    Prompt.page({ limit: 2, offset: 2 }).map((r) => r.name),
    ["charlie", "delta"]
  );
  assert.deepEqual(Prompt.page({ limit: 2, offset: 4 }), []);
});

test("prompt model: a paged row keeps its generations count", () => {
  const db = freshDb();
  const Prompt = require("../../../../models/prompt")(db);
  const Generation = require("../../../../models/generation")(db);

  const id = Prompt.add("Cyber city", "neon streets");
  Prompt.add("Zebra", "stripes");
  Generation.add({ filename: "a.png", prompt_id: id });
  Generation.add({ filename: "b.png", prompt_id: id });

  const rows = Prompt.page({ limit: 10, offset: 0 });
  assert.equal(rows[0].name, "Cyber city");
  assert.equal(rows[0].uses, 2);
  assert.equal(rows[1].uses, 0);
});

test("settings model: page_size, blanks to 0, clamps to max", () => {
  const db = freshDb();
  const Settings = require("../../../../models/settings")(db);
  const base = { default_size: "1024x1024", model: "1.5" };

  Settings.update({ ...base, page_size: "12" });
  assert.equal(Settings.get().page_size, 12);

  Settings.update({ ...base, page_size: "" });
  assert.equal(Settings.get().page_size, 0);

  Settings.update({ ...base, page_size: "9999" });
  assert.equal(Settings.get().page_size, MAX_PAGE_SIZE);
});

function fakeReq(Settings, parts) {
  return Object.assign({ settings: Settings.get() }, parts);
}

test("prompts controller: index pages and clamps an out of range page", () => {
  const db = freshDb();
  const Prompt = require("../../../../models/prompt")(db);
  const Generation = require("../../../../models/generation")(db);
  const Settings = require("../../../../models/settings")(db);
  Settings.update({ default_size: "1024x1024", model: "1.5", page_size: "2" });
  ["a", "b", "c", "d", "e"].forEach((name) => Prompt.add(name, `${name} text`));

  const ctrl = require("../../../../controllers/promptsController")({
    models: { db, Prompt, Generation, Settings, Category: { all: () => [] } },
  });

  let res = fakeRes();
  ctrl.index(fakeReq(Settings, { params: { page: "2" } }), res);
  assert.equal(res.rendered.view, "prompts");
  assert.equal(res.rendered.data.pageSize, 2);
  assert.equal(res.rendered.data.total, 5);
  assert.equal(res.rendered.data.totalPages, 3);
  assert.equal(res.rendered.data.page, 2);
  assert.deepEqual(
    res.rendered.data.prompts.map((p) => p.name),
    ["c", "d"]
  );

  res = fakeRes();
  ctrl.index(fakeReq(Settings, { params: { page: "99" } }), res);
  assert.equal(res.rendered.data.page, 3);
  assert.equal(res.rendered.data.prompts.length, 1);

  res = fakeRes();
  ctrl.index(fakeReq(Settings, { query: { page: "3" } }), res);
  assert.equal(res.rendered.data.page, 3);

  res = fakeRes();
  ctrl.index(fakeReq(Settings, { params: { page: "abc" } }), res);
  assert.equal(res.rendered.data.page, 1);
});

test("generations controller: index pages and clamps an out of range page", () => {
  const db = freshDb();
  const Generation = require("../../../../models/generation")(db);
  const Settings = require("../../../../models/settings")(db);
  Settings.update({ default_size: "1024x1024", model: "1.5", page_size: "2" });
  for (let i = 1; i <= 5; i++) Generation.add({ filename: `f${i}.png` });

  const ctrl = require("../../../../controllers/generationsController")({
    models: {
      Generation,
      Settings,
      ModelPrice: { all: () => ({}) },
      Collection: require("../../../../models/collection")(db),
    },
    pending: {},
    access: { sharing: () => false, slug: () => false },
  });

  let res = fakeRes();
  ctrl.index(fakeReq(Settings, { query: { page: "2" } }), res);
  assert.equal(res.rendered.data.pageSize, 2);
  assert.equal(res.rendered.data.total, 5);
  assert.equal(res.rendered.data.totalPages, 3);
  assert.equal(res.rendered.data.page, 2);
  assert.equal(res.rendered.data.generations.length, 2);

  res = fakeRes();
  ctrl.index(fakeReq(Settings, { query: { page: "99" } }), res);
  assert.equal(res.rendered.data.page, 3);
  assert.equal(res.rendered.data.generations.length, 1);

  res = fakeRes();
  ctrl.index(fakeReq(Settings, { query: { page: "abc" } }), res);
  assert.equal(res.rendered.data.page, 1);

  res = fakeRes();
  ctrl.index(fakeReq(Settings, { params: { page: "3" } }), res);
  assert.equal(res.rendered.data.page, 3);
  assert.equal(res.rendered.data.generations.length, 1);
});
