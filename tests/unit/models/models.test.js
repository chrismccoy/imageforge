/**
 * Model tests
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { quietLog } = require("../../helpers/quietLog");
const Database = require("better-sqlite3");
const schema = require("../../../db/schema");
const secretBox = require("../../../utils/security/secretBox");

const KEY_ONE = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
const KEY_TWO = "ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100";

function freshDb() {
  const db = new Database(":memory:");
  schema.init(db);
  return db;
}

test("prompt model: add, list, get, update, remove", () => {
  const Prompt = require("../../../models/prompt")(freshDb());

  const info = Prompt.add("Fox", "a red fox");
  assert.equal(Prompt.all().length, 1);

  const row = Prompt.get(info);
  assert.equal(row.name, "Fox");
  assert.equal(row.prompt, "a red fox");

  Prompt.update(row.id, "Fox 2", "a blue fox");
  assert.equal(Prompt.get(row.id).name, "Fox 2");

  Prompt.remove(row.id);
  assert.equal(Prompt.all().length, 0);
});

test("prompt model: all() reports use counts from generations", () => {
  const db = freshDb();
  const Prompt = require("../../../models/prompt")(db);
  const Generation = require("../../../models/generation")(db);

  const p = Prompt.add("P", "text");
  const id = p;
  Generation.add({ filename: "a.png", prompt: "text", prompt_id: id });
  Generation.add({ filename: "b.png", prompt: "text", prompt_id: id });

  assert.equal(Prompt.all()[0].uses, 2);
});

test("generation model: add defaults and purge", () => {
  const Generation = require("../../../models/generation")(freshDb());

  Generation.add({ filename: "x.png" }); 
  const rows = Generation.all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].prompt, "");
  assert.equal(rows[0].model, "");

  Generation.purge(rows[0].id);
  assert.equal(Generation.all().length, 0);
});

test("generation history survives deleting its prompt (soft prompt_id link)", () => {
  const db = freshDb();
  const Prompt = require("../../../models/prompt")(db);
  const Generation = require("../../../models/generation")(db);

  const p = Prompt.add("Fox", "a red fox");
  const promptId = p;
  Generation.add({
    filename: "fox.png",
    prompt: "a red fox",
    prompt_id: promptId,
  });

  Prompt.remove(promptId);

  assert.equal(Prompt.get(promptId), null);
  const rows = Generation.all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].prompt, "a red fox");
  assert.equal(Generation.get(rows[0].id).prompt_id, promptId);
});

test("settings model: API key is encrypted at rest and read back as plaintext", () => {
  const secrets = secretBox.withKey(KEY_ONE);
  {
    const db = freshDb();
    const Settings = require("../../../models/settings")(db, { secrets });

    Settings.update({ default_size: "auto", model: "2", api_key: "sk-secret" });

    const rawRow = db.prepare("SELECT api_key FROM settings WHERE id = 1").get();
    assert.ok(rawRow.api_key.startsWith("enc:v1:"));
    assert.ok(!rawRow.api_key.includes("sk-secret"));

    assert.equal(Settings.get().api_key, "sk-secret");

    Settings.update({ default_size: "auto", model: "2", api_key: undefined });
    assert.equal(Settings.get().api_key, "sk-secret");
  }
});

test("settings model: an undecryptable key reads as empty rather than throwing", () => {
  const db = freshDb();

  const built = require("../../../models/settings");
  built(db, { secrets: secretBox.withKey(KEY_ONE) }).update({
    default_size: "auto",
    model: "2",
    api_key: "sk-secret",
  });

  const log = quietLog();
  const afterRotation = built(db, {
    secrets: secretBox.withKey(KEY_TWO),
    log,
  });

  assert.equal(afterRotation.get().api_key, "");
  assert.ok(log.said(/Could not decrypt/), "and it says so rather than passing");
});

test("settings model: seed present and invalid values fall back", () => {
  const Settings = require("../../../models/settings")(freshDb());

  const seeded = Settings.get();
  assert.equal(seeded.default_size, "1024x1024");
  assert.equal(seeded.model, "1.5");

  Settings.update({ default_size: "bogus", model: "99", api_key: "sk-test" });
  const after = Settings.get();
  assert.equal(after.default_size, "1024x1024"); 
  assert.equal(after.model, "1.5"); 
  assert.equal(after.api_key, "sk-test");

  Settings.update({ default_size: "auto", model: "2", api_key: undefined });
  const final = Settings.get();
  assert.equal(final.default_size, "auto");
  assert.equal(final.model, "2");
  assert.equal(final.api_key, "sk-test");
});

test("generation model: token usage round-trips, including zero", () => {
  const db = freshDb();
  const Generation = require("../../../models/generation")(db);

  Generation.add({
    filename: "counted.png",
    prompt: "a blue sky",
    model: "gpt-image-1.5",
    size: "1024x1024",
    usage: {
      total: 1265,
      input: 15,
      output: 1250,
      inputText: 15,
      inputImage: 0,
      outputText: 194,
      outputImage: 1056,
    },
  });

  const row = Generation.get(Generation.all()[0].id);
  assert.equal(row.usage_total_tokens, 1265);
  assert.equal(row.usage_input_tokens, 15);
  assert.equal(row.usage_output_tokens, 1250);
  assert.equal(row.usage_input_text_tokens, 15);
  assert.equal(row.usage_input_image_tokens, 0);
  assert.equal(row.usage_output_text_tokens, 194);
  assert.equal(row.usage_output_image_tokens, 1056);
});

test("generation model: a row with no usage stores nulls", () => {
  const db = freshDb();
  const Generation = require("../../../models/generation")(db);

  Generation.add({ filename: "plain.png", prompt: "", size: "" });

  const row = Generation.get(Generation.all()[0].id);
  for (const column of [
    "usage_total_tokens",
    "usage_input_tokens",
    "usage_output_tokens",
    "usage_input_text_tokens",
    "usage_input_image_tokens",
    "usage_output_text_tokens",
    "usage_output_image_tokens",
  ]) {
    assert.equal(row[column], null, `${column} should be null`);
  }
});

test("generation model: a partial usage object stores what it has", () => {
  const db = freshDb();
  const Generation = require("../../../models/generation")(db);

  Generation.add({
    filename: "partial.png",
    prompt: "",
    size: "",
    usage: {
      total: 100,
      input: null,
      output: null,
      inputText: null,
      inputImage: null,
      outputText: null,
      outputImage: null,
    },
  });

  const row = Generation.get(Generation.all()[0].id);
  assert.equal(row.usage_total_tokens, 100);
  assert.equal(row.usage_input_tokens, null);
});

test("generation model: the list query carries the total", () => {
  const db = freshDb();
  const Generation = require("../../../models/generation")(db);

  Generation.add({
    filename: "listed.png",
    prompt: "",
    size: "",
    usage: {
      total: 211,
      input: 15,
      output: 196,
      inputText: 15,
      inputImage: 0,
      outputText: 0,
      outputImage: 196,
    },
  });

  assert.equal(
    Generation.page({ limit: 10, offset: 0 })[0].usage_total_tokens,
    211
  );
});

test("a fresh database has all seven usage columns", () => {
  const db = freshDb();
  const names = db
    .prepare("PRAGMA table_info(generations)")
    .all()
    .map((c) => c.name);

  for (const column of [
    "usage_total_tokens",
    "usage_input_tokens",
    "usage_output_tokens",
    "usage_input_text_tokens",
    "usage_input_image_tokens",
    "usage_output_text_tokens",
    "usage_output_image_tokens",
  ]) {
    assert.ok(names.includes(column), `missing ${column}`);
  }
});

test("generation model: search filters the list and the count together", () => {
  const db = freshDb();
  const Generation = require("../../../models/generation")(db);

  Generation.add({ filename: "a.png", prompt: "a misty Tokyo alley", size: "" });
  Generation.add({ filename: "b.png", prompt: "a red bicycle", size: "" });
  Generation.add({ filename: "c.png", prompt: "TOKYO at night", size: "" });

  const search = "%tokyo%";
  assert.equal(Generation.count({ search }), 2, "LIKE is case-insensitive");
  assert.deepEqual(
    Generation.page({ search, limit: 10, offset: 0 })
      .map((r) => r.filename)
      .sort(),
    ["a.png", "c.png"]
  );

  assert.equal(Generation.count(), 3);
  assert.equal(Generation.count({}), 3);
  assert.equal(Generation.page({ limit: 10, offset: 0 }).length, 3);
});

test("generation model: a search matches mid-word", () => {
  const db = freshDb();
  const Generation = require("../../../models/generation")(db);
  Generation.add({ filename: "a.png", prompt: "unmistakably blue", size: "" });

  assert.equal(Generation.count({ search: "%mistak%" }), 1);
});

test("generation model: a wildcard in the pattern is honoured, an escaped one is not", () => {
  const db = freshDb();
  const Generation = require("../../../models/generation")(db);
  Generation.add({ filename: "a.png", prompt: "100% cotton", size: "" });
  Generation.add({ filename: "b.png", prompt: "plain cotton", size: "" });

  assert.equal(Generation.count({ search: "%100\\%%" }), 1);
  assert.equal(Generation.count({ search: "%" }), 2);
});

test("generation model: search paginates", () => {
  const db = freshDb();
  const Generation = require("../../../models/generation")(db);
  for (let i = 0; i < 5; i += 1) {
    Generation.add({ filename: `cat${i}.png`, prompt: "a cat", size: "" });
  }
  Generation.add({ filename: "dog.png", prompt: "a dog", size: "" });

  const search = "%cat%";
  assert.equal(Generation.count({ search }), 5);
  assert.equal(Generation.page({ search, limit: 2, offset: 0 }).length, 2);
  assert.equal(Generation.page({ search, limit: 2, offset: 4 }).length, 1);
});

test("prompt model: search matches the name or the text", () => {
  const db = freshDb();
  const Prompt = require("../../../models/prompt")(db);

  Prompt.add("Logos", "a clean vector mark for a company");
  Prompt.add("Skyline", "a logo-free city at dusk");
  Prompt.add("Bicycle", "a red bicycle by a wall");

  const search = "%logo%";
  assert.equal(Prompt.count({ search }), 2);
  assert.deepEqual(
    Prompt.page({ search, limit: 10, offset: 0 })
      .map((r) => r.name)
      .sort(),
    ["Logos", "Skyline"]
  );

  assert.equal(Prompt.count(), 3);
  assert.equal(Prompt.page({ limit: 10, offset: 0 }).length, 3);
});

test("prompt model: a filtered page still reports how many images used each prompt", () => {
  const db = freshDb();
  const Prompt = require("../../../models/prompt")(db);
  const Generation = require("../../../models/generation")(db);

  const id = Prompt.add("Logos", "a clean vector mark");
  Generation.add({
    filename: "a.png",
    prompt: "a clean vector mark",
    prompt_id: id,
    size: "",
  });

  const row = Prompt.page({ search: "%logo%", limit: 10, offset: 0 })[0];
  assert.equal(row.uses, 1);
});

test("prompt model: search paginates", () => {
  const db = freshDb();
  const Prompt = require("../../../models/prompt")(db);
  for (let i = 0; i < 5; i += 1) Prompt.add(`Cat ${i}`, "a cat");
  Prompt.add("Dog", "a dog");

  const search = "%cat%";
  assert.equal(Prompt.count({ search }), 5);
  assert.equal(Prompt.page({ search, limit: 2, offset: 4 }).length, 1);
});

test("generation model: a fresh row is not a favorite", () => {
  const db = freshDb();
  const Generation = require("../../../models/generation")(db);
  const id = Generation.add({ filename: "a.png", prompt: "a cat", size: "" });

  assert.equal(Generation.get(id).favorite, 0);
  assert.equal(Generation.page({ limit: 10, offset: 0 })[0].favorite, 0);
});

test("generation model: toggling a favorite flips it and reports the new value", () => {
  const db = freshDb();
  const Generation = require("../../../models/generation")(db);
  const id = Generation.add({ filename: "a.png", prompt: "a cat", size: "" });

  assert.equal(Generation.toggleFavorite(id), 1);
  assert.equal(Generation.get(id).favorite, 1);

  assert.equal(Generation.toggleFavorite(id), 0);
  assert.equal(Generation.get(id).favorite, 0);
});

test("generation model: toggling an unknown id changes nothing", () => {
  const db = freshDb();
  const Generation = require("../../../models/generation")(db);
  const id = Generation.add({ filename: "a.png", prompt: "a cat", size: "" });

  assert.equal(Generation.toggleFavorite(9999), 0);
  assert.equal(Generation.get(id).favorite, 0);
});

test("generation model: the favorite filter selects only starred rows", () => {
  const db = freshDb();
  const Generation = require("../../../models/generation")(db);
  const keep = Generation.add({ filename: "a.png", prompt: "a cat", size: "" });
  Generation.add({ filename: "b.png", prompt: "a dog", size: "" });
  Generation.toggleFavorite(keep);

  assert.equal(Generation.count({ favorite: true }), 1);
  assert.deepEqual(
    Generation.page({ favorite: true, limit: 10, offset: 0 }).map(
      (r) => r.filename
    ),
    ["a.png"]
  );

  assert.equal(Generation.count({ favorite: false }), 2);
  assert.equal(Generation.count({}), 2);
});

test("generation model: favorite and search compose", () => {
  const db = freshDb();
  const Generation = require("../../../models/generation")(db);
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

  const both = { search: "%tokyo%", favorite: true };
  assert.equal(Generation.count(both), 1);
  assert.deepEqual(
    Generation.page({ ...both, limit: 10, offset: 0 }).map((r) => r.filename),
    ["a.png"]
  );
});

test("a fresh database has the favorite column defaulting to zero", () => {
  const db = freshDb();
  const column = db
    .prepare("PRAGMA table_info(generations)")
    .all()
    .find((c) => c.name === "favorite");

  assert.ok(column, "the column should exist");
  assert.equal(column.notnull, 1);
  assert.equal(column.dflt_value, "0");
});
