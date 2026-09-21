/**
 * Pricing tests
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const schema = require("../../../db/schema");

function freshDb() {
  const db = new Database(":memory:");
  schema.init(db);
  return db;
}

function prices(db) {
  return require("../../../models/modelPrice")(db);
}

test("a fresh database has the model_prices table and no rows", () => {
  const db = freshDb();
  const names = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((r) => r.name);

  assert.ok(names.includes("model_prices"));
  assert.deepEqual(prices(db).all(), {});
});

test("a rate pair round-trips, keyed by model", () => {
  const db = freshDb();
  const ModelPrice = prices(db);

  assert.equal(
    ModelPrice.set("gpt-image-2", 5, 40, "2026-08-10T00:00:00.000Z"),
    true
  );

  const all = ModelPrice.all();
  assert.deepEqual(all["gpt-image-2"], {
    input: 5,
    output: 40,
    updatedAt: "2026-08-10T00:00:00.000Z",
  });
});

test("setting a model again replaces rather than duplicating", () => {
  const db = freshDb();
  const ModelPrice = prices(db);

  ModelPrice.set("gpt-image-2", 5, 40, "2026-08-10T00:00:00.000Z");
  ModelPrice.set("gpt-image-2", 6, 50, "2026-08-11T00:00:00.000Z");

  const all = ModelPrice.all();
  assert.equal(Object.keys(all).length, 1);
  assert.equal(all["gpt-image-2"].input, 6);
  assert.equal(all["gpt-image-2"].updatedAt, "2026-08-11T00:00:00.000Z");
});

test("zero is a legitimate price", () => {
  const db = freshDb();
  const ModelPrice = prices(db);

  assert.equal(
    ModelPrice.set("free-model", 0, 0, "2026-08-10T00:00:00.000Z"),
    true
  );
  assert.equal(ModelPrice.all()["free-model"].input, 0);
});

test("a rate that is not a number of zero or more is refused", () => {
  const db = freshDb();
  const ModelPrice = prices(db);

  const bad = [
    ["gpt-image-2", -1, 40],
    ["gpt-image-2", 5, -0.5],
    ["gpt-image-2", "5", 40],
    ["gpt-image-2", NaN, 40],
    ["gpt-image-2", Infinity, 40],
    ["gpt-image-2", null, 40],
    ["", 5, 40],
  ];

  for (const [model, input, output] of bad) {
    assert.equal(
      ModelPrice.set(model, input, output, "2026-08-10T00:00:00.000Z"),
      false,
      `${model} ${input} ${output} should be refused`
    );
  }
  assert.deepEqual(ModelPrice.all(), {}, "nothing should have been written");
});

test("clearing a model removes its row", () => {
  const db = freshDb();
  const ModelPrice = prices(db);

  ModelPrice.set("gpt-image-2", 5, 40, "2026-08-10T00:00:00.000Z");
  ModelPrice.clear("gpt-image-2");

  assert.deepEqual(ModelPrice.all(), {});
});

test("updatedAt reports the most recent save, or nothing", () => {
  const db = freshDb();
  const ModelPrice = prices(db);

  assert.equal(ModelPrice.updatedAt(), null);

  ModelPrice.set("gpt-image-1.5", 5, 40, "2026-08-09T00:00:00.000Z");
  ModelPrice.set("gpt-image-2", 5, 40, "2026-08-11T00:00:00.000Z");

  assert.equal(ModelPrice.updatedAt(), "2026-08-11T00:00:00.000Z");
});

const { buildModels, initSchema } = require("../../../models");
const buildSettingsController = require("../../../controllers/settingsController");

function recordingRes() {
  return {
    rendered: null,
    status() {
      return this;
    },
    render(view, data) {
      this.rendered = { view, data };
      return this;
    },
  };
}

function settingsSetup() {
  const models = buildModels(initSchema(new Database(":memory:")));
  const credentials = {
    apiKey: () => "",
    apiKeyFromEnv: () => false,
    model: () => "1.5",
  };
  return {
    models,
    ctrl: buildSettingsController({ models, openaiCredentials: credentials }),
  };
}

function settingsReq(body, models) {
  let row;
  return {
    body: { _csrf: "tok", ...body },
    session: { csrfToken: "tok" },
    get settings() {
      if (row === undefined) row = models.Settings.get();
      return row;
    },
    settingsChanged() {
      row = undefined;
    },
  };
}

test("the settings form saves a rate pair per model", () => {
  const { models, ctrl } = settingsSetup();

  ctrl.update(
    settingsReq(
      {
        default_size: "1024x1024",
        model: "1.5",
        price_in_2: "5",
        price_out_2: "40",
      },
      models
    ),
    recordingRes()
  );

  const all = models.ModelPrice.all();
  assert.equal(all["gpt-image-2"].input, 5);
  assert.equal(all["gpt-image-2"].output, 40);
  assert.ok(all["gpt-image-2"].updatedAt, "a save is dated");
});

test("clearing both fields forgets a model's price", () => {
  const { models, ctrl } = settingsSetup();
  models.ModelPrice.set("gpt-image-2", 5, 40, "2026-08-10T00:00:00.000Z");

  ctrl.update(
    settingsReq(
      {
        default_size: "1024x1024",
        model: "1.5",
        price_in_2: "",
        price_out_2: "",
      },
      models
    ),
    recordingRes()
  );

  assert.deepEqual(models.ModelPrice.all(), {});
});

test("a nonsense rate leaves the stored price alone", () => {
  const { models, ctrl } = settingsSetup();
  models.ModelPrice.set("gpt-image-2", 5, 40, "2026-08-10T00:00:00.000Z");

  ctrl.update(
    settingsReq(
      {
        default_size: "1024x1024",
        model: "1.5",
        price_in_2: "banana",
        price_out_2: "40",
      },
      models
    ),
    recordingRes()
  );

  assert.equal(models.ModelPrice.all()["gpt-image-2"].input, 5, "unchanged");
});

test("the settings page is given the prices and when they were saved", () => {
  const { models, ctrl } = settingsSetup();
  models.ModelPrice.set("gpt-image-2", 5, 40, "2026-08-10T00:00:00.000Z");

  const res = recordingRes();
  ctrl.index(settingsReq({}, models), res);

  assert.equal(res.rendered.data.modelPrices["gpt-image-2"].input, 5);
  assert.equal(res.rendered.data.pricesUpdatedAt, "2026-08-10T00:00:00.000Z");
});
