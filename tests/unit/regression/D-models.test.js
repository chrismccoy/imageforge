/**
 * Regression: models (group D)
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");

const { freshDb } = require("../../helpers/app");
const { buildModels } = require("../../../models");

function anImage(Generation, name = "a.png") {
  return Generation.add({ filename: name, prompt: "a cat", model: "gpt-image-2" });
}

test("trashing an image already in the trash changes nothing", () => {
  const db = freshDb();
  const { Generation, ops } = buildModels(db);
  const id = anImage(Generation);

  assert.equal(Generation.trash(id), true);
  const first = Generation.getAnyState(id).deleted_at;
  db.prepare("UPDATE generations SET deleted_at = ? WHERE id = ?").run(
    "2020-01-01T00:00:00.000Z",
    id
  );

  assert.equal(Generation.trash(id), false, "not reported as moved");
  assert.equal(
    Generation.getAnyState(id).deleted_at,
    "2020-01-01T00:00:00.000Z",
    "deleted_at is not reset"
  );
  assert.ok(first);
  assert.equal(ops.trashImages([id]), 0, "trashImages counts only real moves");
  db.close();
});

test("spend counts no images as costed when input tokens are unknown", () => {
  const db = freshDb();
  const { Spend } = buildModels(db);

  Spend.recordGenerated({
    model: "gpt-image-2",
    usage: { input: null, output: null, total: null },
    images: 2,
  });

  const row = db
    .prepare("SELECT * FROM model_spend WHERE model = ?")
    .get("gpt-image-2");
  assert.equal(row.images, 2);
  assert.equal(row.counted_images, 0);
  db.close();
});

test("spend still counts images whose input tokens are known", () => {
  const db = freshDb();
  const { Spend } = buildModels(db);

  Spend.recordGenerated({
    model: "gpt-image-2",
    usage: { input: 10, output: 20, total: 30 },
    images: 2,
  });

  const row = db
    .prepare("SELECT * FROM model_spend WHERE model = ?")
    .get("gpt-image-2");
  assert.equal(row.counted_images, 2);
  db.close();
});

test("a prompt pointing at a missing category stores no category", () => {
  const db = freshDb();
  const { Prompt, Category } = buildModels(db);
  const real = Category.add("Real", new Date().toISOString());

  const id = Prompt.add("one", "a cat", 999);
  assert.equal(Prompt.get(id).category_id, null, "add drops a stale id");

  Prompt.update(id, "one", "a cat", real);
  assert.equal(Prompt.get(id).category_id, real, "a real one is kept");

  Prompt.update(id, "one", "a cat", 998);
  assert.equal(Prompt.get(id).category_id, null, "update drops a stale id");
  db.close();
});

test("the image counts leave trashed images out", () => {
  const db = freshDb();
  const { Generation, Stats } = buildModels(db);
  const keep = anImage(Generation, "keep.png");
  const gone = anImage(Generation, "gone.png");
  Generation.trash(gone);

  assert.equal(Stats.total(), 1);
  assert.equal(Stats.countSince("2000-01-01T00:00:00.000Z"), 1);
  assert.ok(keep);
  db.close();
});

test("renaming a row that is not there reports false", () => {
  const db = freshDb();
  const { Category, Collection } = buildModels(db);

  assert.equal(Category.rename(999, "Nope"), false);
  assert.equal(Collection.rename(999, "Nope"), false);

  const id = Category.add("Old", new Date().toISOString());
  assert.equal(Category.rename(id, "New"), true);
  db.close();
});

test("sharing a row that is not there returns null", () => {
  const db = freshDb();
  const { Generation, Collection } = buildModels(db);

  assert.equal(
    Generation.share(999, () => "tok-gen"),
    null
  );
  assert.equal(
    Collection.share(999, "Title", () => "tok-col"),
    null
  );

  const id = anImage(Generation);
  assert.equal(
    Generation.share(id, () => "tok-real"),
    "tok-real"
  );
  db.close();
});

test("a half-filled price pair is refused, not saved as free", () => {
  const db = freshDb();
  const { ModelPrice } = buildModels(db);
  const now = "2026-01-01T00:00:00.000Z";

  assert.equal(ModelPrice.applyRates("gpt-image-2", "", "40", now), false);
  assert.equal(ModelPrice.applyRates("gpt-image-2", "5", "", now), false);
  assert.deepEqual(ModelPrice.all(), {}, "nothing stored");

  ModelPrice.applyRates("gpt-image-2", "5", "40", now);
  assert.equal(ModelPrice.applyRates("gpt-image-2", "", "41", now), false);
  assert.equal(ModelPrice.all()["gpt-image-2"].input, 5, "stored pair kept");
  assert.equal(ModelPrice.all()["gpt-image-2"].output, 40);
  db.close();
});

test("saving an unchanged price keeps its updated_at", () => {
  const db = freshDb();
  const { ModelPrice } = buildModels(db);

  ModelPrice.applyRates("gpt-image-2", "5", "40", "2026-01-01T00:00:00.000Z");
  ModelPrice.applyRates("gpt-image-2", "5", "40", "2026-02-01T00:00:00.000Z");
  assert.equal(
    ModelPrice.all()["gpt-image-2"].updatedAt,
    "2026-01-01T00:00:00.000Z"
  );

  ModelPrice.applyRates("gpt-image-2", "6", "40", "2026-03-01T00:00:00.000Z");
  assert.equal(
    ModelPrice.all()["gpt-image-2"].updatedAt,
    "2026-03-01T00:00:00.000Z",
    "a changed pair is stamped"
  );
  db.close();
});
