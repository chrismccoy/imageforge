/**
 * Prompt character counter tests
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const FILE = path.join(__dirname, "..", "..", "public", "js", "char-count.js");

function load() {
  const sandbox = {
    document: {
      querySelectorAll: () => [],
      getElementById: () => null,
      addEventListener() {},
    },
    window: {},
    console,
  };
  vm.runInNewContext(fs.readFileSync(FILE, "utf8"), sandbox);
  return sandbox.window.ImageForgeCharCount;
}

test("an empty box says nothing has been typed", () => {
  const { countLabel } = load();
  assert.equal(countLabel(""), "0 characters");
});

test("one character is not called characters", () => {
  const { countLabel } = load();
  assert.equal(countLabel("a"), "1 character");
});

test("a long prompt reads with a separator", () => {
  const { countLabel } = load();
  assert.equal(countLabel("x".repeat(1234)), "1,234 characters");
});

test("nothing at all counts as nothing, rather than breaking", () => {
  const { countLabel } = load();
  assert.equal(countLabel(null), "0 characters");
  assert.equal(countLabel(undefined), "0 characters");
});

test("a character that takes two slots in memory is still one character", () => {
  const { characters } = load();
  assert.equal(characters("🙂"), 1);
  assert.equal(characters("ab🙂"), 3);
});

test("spaces and newlines are characters like any other", () => {
  const { characters } = load();
  assert.equal(characters("a b\nc"), 5);
});

const { startApp, signIn, freshDb, uploadFixture } = require("../helpers/app");
const { buildModels } = require("../../models");

async function page(db, url) {
  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const res = await fetch(`${app.base}${url}`, { headers: { cookie } });
    return await res.text();
  } finally {
    app.stop();
  }
}

function assertCounts(html, fieldId, where) {
  assert.match(
    html,
    new RegExp(`data-char-count="${fieldId}"`),
    `${where} counts #${fieldId}`
  );
  assert.match(html, new RegExp(`id="${fieldId}"`), `${where} has #${fieldId}`);
  assert.match(html, /src="\/js\/char-count\.js"/, `${where} loads the counter`);
}

test("the generate page counts its prompt box", async () => {
  const db = freshDb();
  try {
    assertCounts(await page(db, "/generate"), "prompt", "generate");
  } finally {
    db.close();
  }
});

test("the add prompt page counts its prompt box", async () => {
  const db = freshDb();
  try {
    assertCounts(await page(db, "/prompts/new"), "prompt", "the prompt form");
  } finally {
    db.close();
  }
});

test("the edit page counts what you ask for instead", async () => {
  const db = freshDb();
  const fixture = uploadFixture();
  try {
    const id = buildModels(db).Generation.add({
      filename: fixture.filename,
      prompt: "a cat",
      model: "gpt-image-2",
      size: "1024x1024",
    });
    assertCounts(await page(db, `/edit/${id}`), "prompt", "edit");
  } finally {
    fixture.remove();
    db.close();
  }
});
