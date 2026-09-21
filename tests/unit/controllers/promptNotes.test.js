/**
 * Prompt notes
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const { buildModels, initSchema } = require("../../../models");
const buildController = require("../../../controllers/promptsController");
const { toExport, parseImport } = require("../../../utils/domain/promptTransfer");

function models() {
  return buildModels(initSchema(new Database(":memory:")));
}

function fakeRes() {
  return {
    redirectedTo: null,
    statusCode: 200,
    view: null,
    locals: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    redirect(to) {
      this.redirectedTo = to;
      return this;
    },
    render(view, locals) {
      this.view = view;
      this.locals = locals;
      return this;
    },
  };
}

test("a note is stored and read back", () => {
  const { Prompt } = models();

  const id = Prompt.add("Fox", "a red fox", null, {
    notes: "Works best at 1536x1024.",
  });

  assert.equal(Prompt.get(id).notes, "Works best at 1536x1024.");
});

test("a prompt without a note has null, not an empty string", () => {
  const { Prompt } = models();

  const bare = Prompt.add("Fox", "a red fox");
  assert.equal(Prompt.get(bare).notes, null);

  const blank = Prompt.add("Badger", "a badger", null, { notes: "   " });
  assert.equal(
    Prompt.get(blank).notes,
    null,
    "whitespace is nothing, and stores as nothing"
  );
});

test("a note can be changed and cleared", () => {
  const { Prompt } = models();

  const id = Prompt.add("Fox", "a red fox", null, { notes: "first" });

  Prompt.update(id, "Fox", "a red fox", null, { notes: "second" });
  assert.equal(Prompt.get(id).notes, "second");

  Prompt.update(id, "Fox", "a red fox", null, { notes: "" });
  assert.equal(Prompt.get(id).notes, null, "a note can be taken back off");
});

test("the list carries the note, so it can be shown without a second query", () => {
  const { Prompt } = models();

  Prompt.add("Fox", "a red fox", null, { notes: "a note" });

  assert.equal(Prompt.all()[0].notes, "a note");
  assert.equal(Prompt.page({ limit: 10, offset: 0 })[0].notes, "a note");
});

test("searching looks in the note as well as the name and the text", () => {
  const { Prompt } = models();

  Prompt.add("Fox", "a red fox", null, { notes: "good for winter scenes" });
  Prompt.add("Badger", "a badger", null, { notes: "too dark" });

  const found = Prompt.page({ search: "%winter%", limit: 10, offset: 0 });
  assert.equal(found.length, 1);
  assert.equal(found[0].name, "Fox");

  assert.equal(Prompt.count({ search: "%winter%" }), 1, "the count agrees");
});

test("the form saves a note posted with it", () => {
  const built = models();
  const ctrl = buildController({ models: built });
  const res = fakeRes();

  ctrl.create(
    {
      body: {
        name: "Fox",
        prompt: "a red fox",
        notes: "Works best at 1536x1024.",
      },
    },
    res
  );

  assert.equal(res.redirectedTo, "/prompts");
  assert.equal(built.Prompt.all()[0].notes, "Works best at 1536x1024.");
});

test("a rejected form hands the note back rather than losing it", () => {
  const built = models();
  const ctrl = buildController({ models: built });
  const res = fakeRes();

  ctrl.create({ body: { name: "", prompt: "a red fox", notes: "keep me" } }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.view, "prompt-form");
  assert.equal(res.locals.prompt.notes, "keep me");
});

test("an edit that fails validation also keeps the note", () => {
  const built = models();
  const id = built.Prompt.add("Fox", "a red fox", null, { notes: "original" });
  const ctrl = buildController({ models: built });
  const res = fakeRes();

  ctrl.update(
    {
      params: { id: String(id) },
      body: { name: "", prompt: "x", notes: "edited" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.locals.prompt.notes, "edited");
});

test("a note travels through an export and back", () => {
  const rows = [
    {
      name: "Fox",
      prompt: "a red fox",
      category_name: null,
      rating: 4,
      default_size: null,
      default_model: null,
      notes: "Works best at 1536x1024.",
    },
  ];

  const file = toExport(rows);
  assert.equal(file.prompts[0].notes, "Works best at 1536x1024.");

  const { entries } = parseImport(JSON.stringify(file));
  assert.equal(entries[0].notes, "Works best at 1536x1024.");
});

test("a file written before notes existed imports without one", () => {
  const older = JSON.stringify({
    version: 1,
    prompts: [{ name: "Fox", prompt: "a red fox" }],
  });

  const { entries } = parseImport(older);
  assert.equal(entries[0].notes, null);
});

test("an imported note reaches the stored prompt", () => {
  const built = models();

  const { entries } = parseImport(
    JSON.stringify({
      version: 1,
      prompts: [{ name: "Fox", prompt: "a red fox", notes: "imported note" }],
    })
  );

  built.ops.importPrompts(entries);

  assert.equal(built.Prompt.all()[0].notes, "imported note");
});
