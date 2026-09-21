/**
 * The model layer's contract
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const { buildModels, initSchema } = require("../../models");

function models() {
  return buildModels(initSchema(new Database(":memory:")));
}

const NOW = "2026-01-01T00:00:00.000Z";

test("add returns the new id, or null when it is refused", () => {
  const { Prompt, Generation, Category, Collection } = models();

  const promptId = Prompt.add("Fox", "a red fox");
  assert.equal(typeof promptId, "number");
  assert.equal(Prompt.get(promptId).name, "Fox");

  assert.equal(typeof Generation.add({ filename: "a.png" }), "number");

  assert.equal(typeof Category.add("Logos", NOW), "number");
  assert.equal(Category.add("logos", NOW), null, "a duplicate name is refused");
  assert.equal(Category.add("  ", NOW), null, "and so is a blank one");

  assert.equal(typeof Collection.add("Work", NOW), "number");
  assert.equal(Collection.add("work", NOW), null);
});

test("a lookup that finds nothing answers null, never undefined", () => {
  const { Prompt, Generation, Category, Collection } = models();

  for (const [what, value] of [
    ["Prompt.get", Prompt.get(999)],
    ["Generation.get", Generation.get(999)],
    ["Generation.getAnyState", Generation.getAnyState(999)],
    ["Generation.getByShareToken", Generation.getByShareToken("nope")],
    ["Category.get", Category.get(999)],
    ["Collection.get", Collection.get(999)],
    ["Collection.byToken", Collection.byToken("nope")],
    ["Collection.byToken(blank)", Collection.byToken("")],
  ]) {
    assert.equal(value, null, `${what} should answer null`);
  }
});

test("a write reports whether it changed a row", () => {
  const { Prompt, Generation, Category, Collection, Settings } = models();

  const id = Prompt.add("Fox", "a red fox");
  assert.equal(Prompt.update(id, "Fox 2", "a blue fox"), true);
  assert.equal(Prompt.update(999, "Ghost", "nothing"), false);

  const gen = Generation.add({ filename: "a.png" });
  assert.equal(Generation.trash(gen), true);
  assert.equal(Generation.restore(gen), true);
  assert.equal(Generation.purge(gen), true);
  assert.equal(Generation.purge(gen), false);

  assert.equal(Category.rename(Category.add("A", NOW), "B"), true);
  assert.equal(Collection.rename(Collection.add("C", NOW), ""), false);

  assert.equal(Settings.update({ default_size: "auto" }), true);
});

test("remove reports the change, in every model that has one", () => {
  const { Prompt, Category, Collection } = models();

  const subjects = [
    ["Prompt", Prompt.remove, () => Prompt.add("Fox", "a red fox")],
    ["Category", Category.remove, () => Category.add("Logos", NOW)],
    ["Collection", Collection.remove, () => Collection.add("Work", NOW)],
  ];

  for (const [name, remove, create] of subjects) {
    const rowId = create();
    assert.equal(remove(rowId), true, `${name}.remove should report the change`);
    assert.equal(
      remove(rowId),
      false,
      `${name}.remove twice should report no change`
    );
  }
});

test("a cross-model operation reports what it changed", () => {
  const { Prompt, Generation, ops } = models();

  const gen = Generation.add({ filename: "a.png" });
  assert.equal(ops.trashImages([gen]), 1, "one image trashed");
  assert.equal(ops.trashImages([]), 0, "nothing asked for, nothing changed");
  assert.equal(ops.purgeImage(gen), true);
  assert.equal(ops.purgeImage(gen), false, "purging it twice changes nothing");

  const prompt = Prompt.add("Fox", "a red fox");
  assert.equal(ops.deletePrompt(prompt), true);
  assert.equal(ops.deletePrompt(prompt), false);
  assert.equal(ops.deletePrompts([Prompt.add("A", "x"), Prompt.add("B", "y")]), 2);
  assert.equal(ops.deletePrompts([]), 0);
});

test("share returns the token now stored, and null only when refused", () => {
  const { Generation, Collection, Settings } = models();

  const gen = Generation.add({ filename: "a.png" });
  assert.equal(
    Generation.share(gen, () => "GENTOKEN01"),
    "GENTOKEN01"
  );
  assert.equal(Generation.get(gen).share_token, "GENTOKEN01");

  const col = Collection.add("Work", NOW);
  assert.equal(
    Collection.share(col, "A public title", () => "COLTOKEN01"),
    "COLTOKEN01"
  );
  assert.equal(Collection.get(col).share_token, "COLTOKEN01");

  assert.equal(
    Collection.share(col, "", () => "COLTOKEN02"),
    null
  );
  assert.equal(
    Collection.share(col, "   ", () => "COLTOKEN02"),
    null
  );
  assert.equal(
    Collection.get(col).share_token,
    "COLTOKEN01",
    "a refused share leaves the live link alone"
  );

  assert.equal(
    Settings.shareFavourites(() => "FAVTOKEN01"),
    "FAVTOKEN01"
  );
});

test("share throws rather than answering null when it runs out of retries", () => {
  const { Generation } = models();

  const first = Generation.add({ filename: "a.png" });
  const second = Generation.add({ filename: "b.png" });
  Generation.share(first, () => "TAKENTOKEN");

  assert.throws(
    () => Generation.share(second, () => "TAKENTOKEN", 3),
    /Could not allocate a share token/
  );
  assert.equal(Generation.get(second).share_token, null);
});

test("anything counting answers the number", () => {
  const { Spend } = models();

  assert.equal(
    Spend.recordGenerated({ model: "gpt-image-2", images: 2 }),
    2,
    "recordGenerated counts, so it answers the number"
  );
  assert.equal(
    Spend.recordGenerated({ model: "gpt-image-2", images: 0 }),
    0,
    "and says so when there was nothing to count"
  );
});

test("no model hands back the driver's RunResult", () => {
  const { Prompt, Generation, Category, Collection, Settings, Spend } = models();

  const returned = [
    Prompt.add("Fox", "a red fox"),
    Generation.add({ filename: "a.png" }),
    Category.add("Logos", NOW),
    Collection.add("Work", NOW),
    Settings.update({ default_size: "auto" }),
    Spend.recordGenerated({ model: "gpt-image-2", images: 1 }),
  ];

  for (const value of returned) {
    assert.equal(
      value && typeof value === "object" && "lastInsertRowid" in value,
      false,
      `a RunResult escaped: ${JSON.stringify(value)}`
    );
  }
});
