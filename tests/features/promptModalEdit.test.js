/**
 * The prompt modal, on the two pages that open it
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";

const test = require("node:test");
const assert = require("node:assert/strict");

const buildGeneration = require("../../models/generation");
const buildPrompt = require("../../models/prompt");
const { freshDb, startApp, signIn } = require("../helpers/app");

async function pageHtml(db, path) {
  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    return await (await fetch(`${app.base}${path}`, { headers: { cookie } })).text();
  } finally {
    app.stop();
  }
}

test("a card names the URL its prompt saves to", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const id = Number(
    Generation.add({ filename: "a.png", prompt: "a lighthouse", size: "" })
  );

  try {
    const html = await pageHtml(db, "/generations");
    assert.match(
      html,
      new RegExp(`data-prompt-save="/generations/${id}/prompt"`)
    );
    assert.match(html, /src="\/js\/prompt-modal\.js"/);
  } finally {
    db.close();
  }
});

test("the prompts page opens the same modal without offering to save", async () => {
  const db = freshDb();
  buildPrompt(db).add("Lighthouses", "a lighthouse", null);

  try {
    const html = await pageHtml(db, "/prompts");
    assert.match(html, /data-prompt-show/);
    assert.equal(html.includes("data-prompt-save"), false);
  } finally {
    db.close();
  }
});

test("an image with no prompt carries an empty one, not the wording for it", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  Generation.add({ filename: "a.png", prompt: "", size: "" });

  try {
    const html = await pageHtml(db, "/generations");
    assert.match(html, /data-prompt=""/);
    assert.equal(html.includes('data-prompt="(no prompt)"'), false);
  } finally {
    db.close();
  }
});

test("the modal carries a box to type in and a way out of the edit", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  Generation.add({ filename: "a.png", prompt: "a lighthouse", size: "" });

  try {
    const html = await pageHtml(db, "/generations");
    assert.match(html, /<textarea id="prompt-modal-edit"/);
    assert.match(html, /id="prompt-modal-edit-start"/);
    assert.match(html, /id="prompt-modal-save"/);
    assert.match(html, /id="prompt-modal-cancel"/);
  } finally {
    db.close();
  }
});
