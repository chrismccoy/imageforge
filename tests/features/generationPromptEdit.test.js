/**
 * Rewriting an image's prompt from the generations page
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
const { buildModels } = require("../../models");
const { freshDb, startApp, signIn, csrfFor } = require("../helpers/app");

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

function savePrompt(base, cookie, csrf, id, prompt) {
  return fetch(`${base}/generations/${id}/prompt`, {
    method: "POST",
    headers: {
      cookie,
      "x-csrf-token": csrf,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt }),
  });
}

test("the endpoint stores the new prompt and answers with it", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const id = anImage(Generation);
  const app = await startApp({ db });

  try {
    const cookie = await signIn(app.base);
    const csrf = await csrfFor(app.base, cookie);

    const res = await savePrompt(
      app.base,
      cookie,
      csrf,
      id,
      "  a lighthouse at dusk  "
    );

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { prompt: "a lighthouse at dusk" });
    assert.equal(Generation.get(id).prompt, "a lighthouse at dusk");
  } finally {
    app.stop();
    db.close();
  }
});

test("the prompt can be emptied and filled from empty", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const id = anImage(Generation, { prompt: "" });
  const app = await startApp({ db });

  try {
    const cookie = await signIn(app.base);
    const csrf = await csrfFor(app.base, cookie);

    await savePrompt(app.base, cookie, csrf, id, "a lighthouse");
    assert.equal(Generation.get(id).prompt, "a lighthouse");

    const cleared = await savePrompt(app.base, cookie, csrf, id, "");
    assert.deepEqual(await cleared.json(), { prompt: "" });
    assert.equal(Generation.get(id).prompt, "");
  } finally {
    app.stop();
    db.close();
  }
});

test("the list finds the image by its new words and not its old ones", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const id = anImage(Generation);
  const app = await startApp({ db });

  try {
    const cookie = await signIn(app.base);
    const csrf = await csrfFor(app.base, cookie);
    await savePrompt(app.base, cookie, csrf, id, "a harbour at dusk");

    const get = (path) =>
      fetch(`${app.base}${path}`, { headers: { cookie } }).then((r) => r.text());

    const found = await get("/generations?q=harbour");
    assert.match(found, /a harbour at dusk/);

    const gone = await get("/generations?q=lighthouse");
    assert.equal(gone.includes("a harbour at dusk"), false);
  } finally {
    app.stop();
    db.close();
  }
});

test("an image made from a saved prompt stays under that prompt", async () => {
  const db = freshDb();
  const { Generation, Prompt } = buildModels(db);
  const promptId = Number(Prompt.add("Lighthouses", "a lighthouse", null));
  const id = anImage(Generation, { prompt_id: promptId });
  const app = await startApp({ db });

  try {
    const cookie = await signIn(app.base);
    const csrf = await csrfFor(app.base, cookie);
    await savePrompt(app.base, cookie, csrf, id, "a harbour at dusk");

    const html = await (
      await fetch(`${app.base}/generations?prompt=${promptId}`, {
        headers: { cookie },
      })
    ).text();

    assert.match(html, /a harbour at dusk/);
    assert.equal(Generation.get(id).prompt_id, promptId);
  } finally {
    app.stop();
    db.close();
  }
});

test("rewording an unknown image is a 404", async () => {
  const db = freshDb();
  const app = await startApp({ db });

  try {
    const cookie = await signIn(app.base);
    const csrf = await csrfFor(app.base, cookie);

    const res = await savePrompt(app.base, cookie, csrf, 9999, "anything");
    assert.equal(res.status, 404);
  } finally {
    app.stop();
    db.close();
  }
});

test("an image in the trash cannot be reworded", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const id = anImage(Generation);
  Generation.trash(id);
  const app = await startApp({ db });

  try {
    const cookie = await signIn(app.base);
    const csrf = await csrfFor(app.base, cookie);

    const res = await savePrompt(app.base, cookie, csrf, id, "a harbour");
    assert.equal(res.status, 404);
    assert.equal(Generation.getAnyState(id).prompt, "a lighthouse");
  } finally {
    app.stop();
    db.close();
  }
});

test("rewording without a CSRF token is refused and changes nothing", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const id = anImage(Generation);
  const app = await startApp({ db });

  try {
    const cookie = await signIn(app.base);
    const res = await fetch(`${app.base}/generations/${id}/prompt`, {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "a harbour" }),
    });

    assert.equal(res.status, 403);
    assert.equal(Generation.get(id).prompt, "a lighthouse");
  } finally {
    app.stop();
    db.close();
  }
});

test("rewording while signed out is refused", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const id = anImage(Generation);
  const app = await startApp({ db });

  try {
    const res = await fetch(`${app.base}/generations/${id}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "a harbour" }),
    });

    assert.equal(res.ok, false);
    assert.equal(Generation.get(id).prompt, "a lighthouse");
  } finally {
    app.stop();
    db.close();
  }
});
