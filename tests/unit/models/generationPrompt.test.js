/**
 * Rewriting the prompt on a saved image
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");

const schema = require("../../../db/schema");
const buildGeneration = require("../../../models/generation");

function freshGenerations() {
  const db = new Database(":memory:");
  schema.init(db);
  return buildGeneration(db);
}

function anImage(Generation, row = {}) {
  return Number(
    Generation.add(
      Object.assign(
        {
          filename: "a.png",
          prompt: "a lighthouse",
          model: "gpt-image-2",
          size: "1024x1024",
        },
        row
      )
    )
  );
}

test("a new prompt replaces the old one", () => {
  const Generation = freshGenerations();
  const id = anImage(Generation);

  assert.equal(Generation.setPrompt(id, "a lighthouse at dusk"), true);
  assert.equal(Generation.get(id).prompt, "a lighthouse at dusk");
});

test("emptying the prompt stores an empty string rather than null", () => {
  const Generation = freshGenerations();
  const id = anImage(Generation);

  Generation.setPrompt(id, "   ");

  assert.equal(Generation.get(id).prompt, "");
});

test("the stored text is trimmed", () => {
  const Generation = freshGenerations();
  const id = anImage(Generation);

  Generation.setPrompt(id, "  a lighthouse at dusk  ");

  assert.equal(Generation.get(id).prompt, "a lighthouse at dusk");
});

test("rewording the prompt leaves the rest of the row alone", () => {
  const Generation = freshGenerations();
  const id = anImage(Generation, { prompt_id: 7 });
  Generation.setShareToken(id, "SHARETOKEN1");
  Generation.toggleFavorite(id);

  Generation.setPrompt(id, "a lighthouse at dusk");

  const row = Generation.get(id);
  assert.equal(row.prompt_id, 7);
  assert.equal(row.share_token, "SHARETOKEN1");
  assert.equal(row.favorite, 1);
});

test("an unknown id changes nothing and says so", () => {
  const Generation = freshGenerations();
  anImage(Generation);

  assert.equal(Generation.setPrompt(9999, "a lighthouse at dusk"), false);
});
