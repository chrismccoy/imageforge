/**
 * Duplicating a saved prompt
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";

const test = require("node:test");
const assert = require("node:assert/strict");

const { startApp, signIn, freshDb } = require("../helpers/app");
const { buildModels } = require("../../models");

async function withPrompt(run) {
  const db = freshDb();
  const { Prompt } = buildModels(db);
  const id = Prompt.add("Logos", "a clean vector mark", null, {
    size: "1024x1024",
    notes: "keep it flat",
  });
  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const get = async (path) => {
      const res = await fetch(`${app.base}${path}`, {
        headers: { cookie },
        redirect: "manual",
      });
      return { status: res.status, html: await res.text(), res };
    };
    await run({ id, get, Prompt });
  } finally {
    app.stop();
    db.close();
  }
}

test("the list offers a copy of each prompt", async () => {
  await withPrompt(async ({ id, get }) => {
    const { html } = await get("/prompts");
    assert.match(html, new RegExp(`/prompts/${id}/duplicate`));
  });
});

test("the copy comes back as a filled in form", async () => {
  await withPrompt(async ({ id, get }) => {
    const { status, html } = await get(`/prompts/${id}/duplicate`);

    assert.equal(status, 200);
    assert.match(html, /value="Copy of Logos"/);
    assert.match(html, /a clean vector mark/);
    assert.match(html, /keep it flat/);
  });
});

test("saving the copy adds a prompt rather than changing the original", async () => {
  await withPrompt(async ({ id, get }) => {
    const { html } = await get(`/prompts/${id}/duplicate`);
    const action = /<form action="([^"]*)" method="post" class="card"/.exec(
      html
    )[1];

    assert.equal(action, "/prompts", "the add route, not /prompts/" + id);
  });
});

test("a copy of a prompt that is not there goes back to the list", async () => {
  await withPrompt(async ({ get }) => {
    const { res } = await get("/prompts/9999/duplicate");
    assert.equal(res.status, 302);
    assert.match(res.headers.get("location"), /\/prompts/);
  });
});

test("asking for a copy saves nothing on its own", async () => {
  await withPrompt(async ({ id, get, Prompt }) => {
    await get(`/prompts/${id}/duplicate`);
    assert.equal(Prompt.count(), 1);
  });
});
