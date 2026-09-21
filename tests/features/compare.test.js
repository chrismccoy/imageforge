/**
 * Comparing an edit
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";

const test = require("node:test");
const assert = require("node:assert/strict");

const { startApp, signIn, freshDb, uploadFixture } = require("../helpers/app");
const { buildModels } = require("../../models");

async function withEdit(run, { trashOriginal = false, trashEdit = false } = {}) {
  const db = freshDb();
  const before = uploadFixture("compare-before");
  const after = uploadFixture("compare-after");
  const { Generation } = buildModels(db);

  const originalId = Generation.add({
    filename: before.filename,
    prompt: "a cat on a wall",
    model: "gpt-image-2",
    size: "1024x1024",
  });
  const editId = Generation.add({
    filename: after.filename,
    prompt: "a cat on a wall, wearing a hat",
    model: "gpt-image-2",
    size: "1024x1024",
    edited_from: originalId,
  });

  if (trashOriginal) Generation.trash(originalId);
  if (trashEdit) Generation.trash(editId);

  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const get = async (url) => {
      const res = await fetch(`${app.base}${url}`, {
        headers: { cookie },
        redirect: "manual",
      });
      return { status: res.status, html: await res.text(), res };
    };
    await run({ get, originalId, editId, before, after, Generation });
  } finally {
    app.stop();
    before.remove();
    after.remove();
    db.close();
  }
}

test("the page shows the edit over the image it was made from", async () => {
  await withEdit(async ({ get, editId, before, after }) => {
    const { status, html } = await get(`/generations/${editId}/compare`);

    assert.equal(status, 200);
    assert.match(html, new RegExp(before.filename), "the original is on it");
    assert.match(html, new RegExp(after.filename), "and so is the edit");
    assert.match(html, /type="range"/, "with something to slide between them");
  });
});

test("the slider starts halfway, so both are visible on arrival", async () => {
  await withEdit(async ({ get, editId }) => {
    const { html } = await get(`/generations/${editId}/compare`);
    const range = /<input[^>]*type="range"[^>]*>/.exec(html)[0];
    assert.match(range, /value="50"/);
  });
});

test("an image that is not an edit has nothing to compare", async () => {
  await withEdit(async ({ get, originalId }) => {
    const { status } = await get(`/generations/${originalId}/compare`);
    assert.equal(status, 404);
  });
});

test("an id that names nothing is a 404, not a crash", async () => {
  await withEdit(async ({ get }) => {
    for (const bad of ["9999", "0", "-1", "abc"]) {
      assert.equal((await get(`/generations/${bad}/compare`)).status, 404, bad);
    }
  });
});

test("an edit whose original is in the trash has nothing to compare with", async () => {
  await withEdit(
    async ({ get, editId }) => {
      const { status } = await get(`/generations/${editId}/compare`);
      assert.equal(status, 404, "the original is gone from the list");
    },
    { trashOriginal: true }
  );
});

test("an edit in the trash is not on show either", async () => {
  await withEdit(
    async ({ get, editId }) => {
      assert.equal((await get(`/generations/${editId}/compare`)).status, 404);
    },
    { trashEdit: true }
  );
});

test("the page is behind the login", async () => {
  const db = freshDb();
  const app = await startApp({ db });
  try {
    const res = await fetch(`${app.base}/generations/1/compare`, {
      redirect: "manual",
    });
    assert.equal(res.status, 302);
    assert.match(res.headers.get("location"), /\/login/);
  } finally {
    app.stop();
    db.close();
  }
});

test("the card offers the comparison from the note about where it came from", async () => {
  await withEdit(async ({ get, editId }) => {
    const { html } = await get("/generations");
    assert.match(html, new RegExp(`/generations/${editId}/compare`));
  });
});
