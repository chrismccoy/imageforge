/**
 * Seed the end to end install
 */

"use strict";

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const schema = require("../db/schema");
const {
  CATEGORIES,
  PROMPTS,
  IMAGES,
  TRASHED,
  COLLECTION,
  PRICES,
  PAGE_SIZE,
} = require("../tests/e2e/support/seed");

const ROOT = path.join(__dirname, "..");
const E2E_DIR = path.join(ROOT, "var", "e2e");
const DB_PATH = path.join(E2E_DIR, "e2e.db");
const UPLOAD_DIR = path.join(E2E_DIR, "uploads");
const FIXTURES = path.join(ROOT, "tests", "e2e", "fixtures");

const NOW = new Date();

function daysAgo(days) {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

function placeImage(image) {
  fs.copyFileSync(
    path.join(FIXTURES, image.fixture),
    path.join(UPLOAD_DIR, image.filename)
  );
}

function seed() {
  fs.rmSync(E2E_DIR, { recursive: true, force: true });
  for (const dir of ["uploads", "backups", "downloads"]) {
    fs.mkdirSync(path.join(E2E_DIR, dir), { recursive: true });
  }

  const db = new Database(DB_PATH);
  schema.init(db);

  const categoryId = {};
  const insertCategory = db.prepare(
    "INSERT INTO categories (name, created_at) VALUES (?, ?)"
  );
  for (const name of Object.values(CATEGORIES)) {
    categoryId[name] = insertCategory.run(name, daysAgo(30)).lastInsertRowid;
  }

  const promptId = {};
  const insertPrompt = db.prepare(`
    INSERT INTO prompts
      (name, prompt, created_at, category_id, rating, default_size, default_model, notes, pinned)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let age = 20;
  for (const [key, prompt] of Object.entries(PROMPTS)) {
    promptId[key] = insertPrompt.run(
      prompt.name,
      prompt.prompt,
      daysAgo(age--),
      prompt.category ? categoryId[prompt.category] : null,
      prompt.rating,
      prompt.size,
      prompt.model,
      prompt.notes,
      prompt.pinned
    ).lastInsertRowid;
  }

  const idByPromptName = Object.fromEntries(
    Object.entries(PROMPTS).map(([key, prompt]) => [prompt.name, promptId[key]])
  );

  const insertImage = db.prepare(`
    INSERT INTO generations
      (filename, prompt, prompt_id, model, size, created_at, share_token, favorite,
       usage_total_tokens, usage_input_tokens, usage_output_tokens, deleted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const imageId = {};
  let imageAge = 6;
  for (const [key, image] of Object.entries(IMAGES)) {
    placeImage(image);
    imageId[key] = insertImage.run(
      image.filename,
      image.prompt,
      idByPromptName[image.promptName] ?? null,
      image.model,
      image.size,
      daysAgo(imageAge--),
      image.shareToken,
      image.favorite,
      image.usage.total,
      image.usage.input,
      image.usage.output,
      null
    ).lastInsertRowid;
  }

  placeImage(TRASHED);
  insertImage.run(
    TRASHED.filename,
    TRASHED.prompt,
    null,
    TRASHED.model,
    TRASHED.size,
    daysAgo(2),
    null,
    0,
    null,
    null,
    null,
    daysAgo(1)
  );

  const collectionId = db
    .prepare(
      "INSERT INTO collections (name, created_at, share_token, public_title) VALUES (?, ?, ?, ?)"
    )
    .run(COLLECTION.name, daysAgo(10), null, null).lastInsertRowid;

  db.prepare(
    "INSERT INTO generation_collections (generation_id, collection_id) VALUES (?, ?)"
  ).run(imageId.collected, collectionId);

  const insertPrice = db.prepare(`
    INSERT INTO model_prices (model, input_per_million, output_per_million, updated_at)
    VALUES (?, ?, ?, ?)
  `);
  for (const [model, price] of Object.entries(PRICES)) {
    insertPrice.run(model, price.input, price.output, daysAgo(1));
  }

  db.prepare(
    "UPDATE settings SET page_size = ?, model = '1.5', default_size = '1024x1024' WHERE id = 1"
  ).run(PAGE_SIZE);

  db.close();
}

seed();
