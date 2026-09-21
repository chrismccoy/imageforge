/**
 * Sharing a collection from its page
 */

"use strict";

const {
  NOW,
  freshDb,
  models,
  at,
  startApp,
  signIn,
  post,
  shared,
} = require("./setup");

const test = require("node:test");
const assert = require("node:assert/strict");

test("a collection is shared and un-shared from its page", async () => {
  const db = freshDb();
  const { Collection } = models(db);
  const id = Collection.add("Acme Corp rebrand", NOW);

  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);

    await post(app.base, `/collections/${id}/share`, cookie, {
      _csrf: csrf,
      title: "Winter campaign",
    });

    const row = Collection.get(id);
    assert.ok(row.share_token, "a token was minted");
    assert.equal(row.public_title, "Winter campaign");

    const html = await (
      await fetch(`${app.base}/collections`, { headers: { cookie } })
    ).text();
    assert.match(html, new RegExp(`/c/${row.share_token}`), "the link is shown");
    assert.match(html, /Shared/, "and it is marked as shared");

    await post(app.base, `/collections/${id}/unshare`, cookie, { _csrf: csrf });
    assert.equal(Collection.get(id).share_token, null);
  } finally {
    app.stop();
    db.close();
  }
});

test("sharing without a title is refused on the page", async () => {
  const db = freshDb();
  const { Collection } = models(db);
  const id = Collection.add("Acme Corp rebrand", NOW);

  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);
    const res = await post(app.base, `/collections/${id}/share`, cookie, {
      _csrf: csrf,
      title: "   ",
    });

    assert.equal(res.status, 400);
    assert.match(await res.text(), /title/i);
    assert.equal(Collection.get(id).share_token, null);
  } finally {
    app.stop();
    db.close();
  }
});

test("an unshared collection shows no link", async () => {
  const db = freshDb();
  models(db).Collection.add("Quiet", NOW);

  const app = await startApp(db);
  try {
    const { cookie } = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/collections`, { headers: { cookie } })
    ).text();
    assert.equal(/\/c\/[0-9A-Za-z]{10}/.test(html), false);
  } finally {
    app.stop();
    db.close();
  }
});

test("the public collections toggle round-trips through settings", async () => {
  const db = freshDb();
  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);

    const before = await (
      await fetch(`${app.base}/settings`, { headers: { cookie } })
    ).text();
    assert.match(before, /name="public_collections"/);

    await post(app.base, "/settings", cookie, {
      _csrf: csrf,
      default_size: "1024x1024",
      model: "1.5",
      page_size: "12",
      public_collections: "on",
    });
    assert.equal(models(db).Settings.get().public_collections, 1);

    await post(app.base, "/settings", cookie, {
      _csrf: csrf,
      default_size: "1024x1024",
      model: "1.5",
      page_size: "12",
    });
    assert.equal(models(db).Settings.get().public_collections, 0);
  } finally {
    app.stop();
    db.close();
  }
});
