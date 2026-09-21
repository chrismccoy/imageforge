/**
 * Prompts controller tests
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
const { buildModels, initSchema } = require("../../models");
const buildController = require("../../controllers/promptsController");
const schema = require("../../db/schema");
const { startApp, signIn } = require("../helpers/app");
const { attrTag } = require("../helpers/dom");

async function promptsHtml() {
  const db = new Database(":memory:");
  schema.init(db);
  buildModels(db).Prompt.add("Logos", "a clean vector mark");

  const app = await startApp({ db });
  const cookie = await signIn(app.base);
  const res = await fetch(`${app.base}/prompts`, { headers: { cookie } });
  const html = await res.text();
  return { html, stop: app.stop, db };
}

function fakeRes() {
  return {
    redirectedTo: null,
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    redirect(to) {
      this.redirectedTo = to;
      return this;
    },
    render() {
      return this;
    },
  };
}

test("deleting a prompt detaches its generations instead of orphaning them", () => {
  const db = initSchema(new Database(":memory:"));
  const models = buildModels(db);
  const { Prompt, Generation } = models;

  const promptId = Prompt.add("greeting", "say hello");
  Generation.add({
    filename: "image-forge-x.png",
    prompt: "say hello",
    prompt_id: promptId,
    model: "gpt-image-1.5",
    size: "1024x1024",
  });

  const ctrl = buildController({ models });
  const res = fakeRes();
  ctrl.remove({ params: { id: String(promptId) } }, res);

  assert.equal(res.redirectedTo, "/prompts");
  assert.equal(Prompt.get(promptId), null, "prompt row should be deleted");

  const rows = Generation.all();
  assert.equal(rows.length, 1, "the saved image is kept");
  const ref = db.prepare("SELECT prompt_id FROM generations").get();
  assert.equal(ref.prompt_id, null, "its prompt_id is detached, not dangling");
});

test("delete is a no-op for a bad id and just returns to the list", () => {
  const models = buildModels(initSchema(new Database(":memory:")));
  const ctrl = buildController({ models });
  const res = fakeRes();
  ctrl.remove({ params: { id: "not-a-number" } }, res);
  assert.equal(res.redirectedTo, "/prompts");
});

function recordingRes() {
  return {
    rendered: null,
    statusCode: 200,
    redirectedTo: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    redirect(to) {
      this.redirectedTo = to;
      return this;
    },
    render(view, data) {
      this.rendered = { view, data };
      return this;
    },
  };
}

function promptsSetup() {
  const models = buildModels(initSchema(new Database(":memory:")));
  return { models, ctrl: buildController({ models }) };
}

test("prompts index filters by search and reports both counts", () => {
  const { models, ctrl } = promptsSetup();
  models.Prompt.add("Logos", "a clean vector mark");
  models.Prompt.add("Bicycle", "a red bicycle");

  const res = recordingRes();
  ctrl.index({ query: { q: "logo" }, params: {} }, res);

  assert.equal(res.rendered.data.total, 1);
  assert.equal(res.rendered.data.totalAll, 2);
  assert.equal(res.rendered.data.q, "logo");
  assert.equal(res.rendered.data.prompts[0].name, "Logos");
});

test("prompts index with no search returns everything", () => {
  const { models, ctrl } = promptsSetup();
  models.Prompt.add("Logos", "a clean vector mark");
  models.Prompt.add("Bicycle", "a red bicycle");

  const res = recordingRes();
  ctrl.index({ query: {}, params: {} }, res);

  assert.equal(res.rendered.data.total, 2);
  assert.equal(res.rendered.data.q, "");
});

test("prompts paging links carry the search term", () => {
  const { models, ctrl } = promptsSetup();
  models.Settings.update({ page_size: "1" });
  models.Prompt.add("Logo one", "a mark");
  models.Prompt.add("Logo two", "a mark");

  const res = recordingRes();
  ctrl.index({ query: { q: "logo" }, params: {} }, res);

  assert.equal(res.rendered.data.nextUrl, "/prompts/page/2?q=logo");
});

test("duplicating fills the add form from the prompt it copies", () => {
  const { models, ctrl } = promptsSetup();
  const id = models.Prompt.add("Logos", "a clean vector mark", null, {
    size: "1024x1024",
    model: "2",
    notes: "keep it flat",
  });

  const res = recordingRes();
  ctrl.duplicateForm({ params: { id: String(id) } }, res);

  const form = res.rendered.data;
  assert.equal(form.prompt.prompt, "a clean vector mark");
  assert.equal(form.prompt.default_size, "1024x1024");
  assert.equal(form.prompt.default_model, "2");
  assert.equal(form.prompt.notes, "keep it flat");
});

test("the copy is named as one, so two prompts are never called the same", () => {
  const { models, ctrl } = promptsSetup();
  const id = models.Prompt.add("Logos", "a clean vector mark");

  const res = recordingRes();
  ctrl.duplicateForm({ params: { id: String(id) } }, res);

  assert.equal(res.rendered.data.prompt.name, "Copy of Logos");
});

test("the copy posts to the add route, so saving it leaves the original alone", () => {
  const { models, ctrl } = promptsSetup();
  const id = models.Prompt.add("Logos", "a clean vector mark");

  const res = recordingRes();
  ctrl.duplicateForm({ params: { id: String(id) } }, res);

  assert.equal(res.rendered.data.mode, "new");
  assert.equal(res.rendered.data.action, "/prompts");
});

test("a copy starts unrated, since it has earned nothing yet", () => {
  const { models, ctrl } = promptsSetup();
  const id = models.Prompt.add("Logos", "a clean vector mark");
  models.Prompt.setRating(id, 5);

  const res = recordingRes();
  ctrl.duplicateForm({ params: { id: String(id) } }, res);

  assert.equal(res.rendered.data.prompt.rating ?? null, null);
});

test("asking for a copy writes nothing until it is saved", () => {
  const { models, ctrl } = promptsSetup();
  const id = models.Prompt.add("Logos", "a clean vector mark");

  ctrl.duplicateForm({ params: { id: String(id) } }, recordingRes());

  assert.equal(models.Prompt.count(), 1, "still just the one prompt");
});

test("a copy of a prompt that is not there goes back to the list", () => {
  const { ctrl } = promptsSetup();
  const res = fakeRes();
  ctrl.duplicateForm({ params: { id: "9999" } }, res);
  assert.equal(res.redirectedTo, "/prompts");
});

test("the pin is an icon that can be greyed", async () => {
  const { html, stop, db } = await promptsHtml();
  try {
    const row = /<tr data-prompt-row[\s\S]*?<\/tr>/.exec(html)[0];
    const pin = attrTag(row, "data-pin", "button");
    assert.match(pin, /fa-thumbtack/);
    assert.match(pin, /text-slate-300/);
    assert.doesNotMatch(pin, /text-brand-600/);
  } finally {
    stop();
    db.close();
  }
});

test("the table uses the shared table styling", async () => {
  const { html, stop, db } = await promptsHtml();
  try {
    assert.match(html, /class="[^"]*data-table/);
  } finally {
    stop();
    db.close();
  }
});
