/**
 * The public favourites page
 */

"use strict";

const {
  freshDb,
  models,
  anImage,
  startApp,
  signIn,
  signInWithCsrf,
  shared,
  at,
} = require("./setup");

const test = require("node:test");
const assert = require("node:assert/strict");

test("the page shows every favourite, shared or not", async () => {
  const db = freshDb();
  const { token } = shared(db, ["a starred cat", "a starred dog"]);
  anImage(db, "an unstarred fish");

  const app = await startApp(db);
  try {
    const res = await fetch(`${app.base}/f/${token}`);
    const html = await res.text();

    assert.equal(res.status, 200);
    assert.match(html, /Favourites/);
    assert.match(html, /2 images/);
    assert.equal(/an unstarred fish/.test(html), false, "only what is starred");
    assert.match(html, /noindex/, "and it is not indexed");

    assert.equal(html.includes("a starred cat"), false, "no prompt on the tile");
    assert.equal(html.includes("a starred dog"), false, "no prompt on the tile");
    assert.equal(html.includes("gpt-image-2"), false, "no model on the tile");
  } finally {
    app.stop();
    db.close();
  }
});

test("an empty favourites page says so", async () => {
  const db = freshDb();
  const { Settings } = models(db);
  Settings.update({ public_favourites: 1 });
  const token = Settings.shareFavourites(() => "FAVEMPTY01");

  const app = await startApp(db);
  try {
    const html = await (await fetch(`${app.base}/f/${token}`)).text();
    assert.match(html, /No favourites yet\./);
  } finally {
    app.stop();
    db.close();
  }
});

test("unstarring takes an image off the public page at once", async () => {
  const db = freshDb();
  const { ids, token } = shared(db, ["a starred cat", "a starred dog"]);

  const app = await startApp(db);
  try {
    models(db).Generation.toggleFavorite(ids[0]);
    const html = await (await fetch(`${app.base}/f/${token}`)).text();
    assert.match(html, /1 image/);
    assert.equal(new RegExp(`/f/${token}/i/${ids[0]}/file`).test(html), false);
  } finally {
    app.stop();
    db.close();
  }
});

test("a trashed favourite is not on the public page", async () => {
  const db = freshDb();
  const { ids, token } = shared(db, ["a starred cat", "a starred dog"]);

  const app = await startApp(db);
  try {
    models(db).Generation.trash(ids[0]);
    const html = await (await fetch(`${app.base}/f/${token}`)).text();
    assert.match(html, /1 image/);
    assert.equal((await fetch(`${app.base}/f/${token}/i/${ids[0]}`)).status, 404);
  } finally {
    app.stop();
    db.close();
  }
});

test("an image that is not a favourite cannot be reached through the link", async () => {
  const db = freshDb();
  const { token } = shared(db);
  const notStarred = anImage(db, "not yours");

  const app = await startApp(db);
  try {
    assert.equal(
      (await fetch(`${app.base}/f/${token}/i/${notStarred}`)).status,
      404
    );
    assert.equal(
      (await fetch(`${app.base}/f/${token}/i/${notStarred}/file`)).status,
      404
    );
  } finally {
    app.stop();
    db.close();
  }
});

test("un-sharing kills every URL under the link", async () => {
  const db = freshDb();
  const { ids, token } = shared(db);

  const app = await startApp(db);
  try {
    assert.equal((await fetch(`${app.base}/f/${token}`)).status, 200);

    models(db).Settings.unshareFavourites();

    for (const path of ["", `/i/${ids[0]}`, `/i/${ids[0]}/file`]) {
      assert.equal(
        (await fetch(`${app.base}/f/${token}${path}`)).status,
        404,
        `/f/<token>${path}`
      );
    }
  } finally {
    app.stop();
    db.close();
  }
});

test("a revoked token looks exactly like one that never existed", async () => {
  const db = freshDb();
  const { token } = shared(db);

  const app = await startApp(db);
  try {
    models(db).Settings.unshareFavourites();
    const revoked = await (await fetch(`${app.base}/f/${token}`)).text();
    const never = await (await fetch(`${app.base}/f/NEVEREXIST`)).text();
    assert.equal(revoked, never);
  } finally {
    app.stop();
    db.close();
  }
});

test("with the setting off the link does not work", async () => {
  const db = freshDb();
  const { token } = shared(db);
  models(db).Settings.update({ public_favourites: 0 });

  const app = await startApp(db);
  try {
    const res = await fetch(`${app.base}/f/${token}`);
    assert.ok([200, 403].includes(res.status), `got ${res.status}`);
  } finally {
    app.stop();
    db.close();
  }
});

test("the gallery links to it only for someone signed in", async () => {
  const db = freshDb();
  const { token } = shared(db);
  models(db).Settings.update({ public_share: 1, public_gallery: 1 });

  const app = await startApp(db);
  try {
    const anon = await (await fetch(`${app.base}/gallery`)).text();
    assert.equal(anon.includes(token), false, "the token is not published");
    assert.equal(/\/f\//.test(anon), false);

    const cookie = await signIn(app.base);
    const mine = await (
      await fetch(`${app.base}/gallery`, { headers: { cookie } })
    ).text();
    assert.match(mine, new RegExp(`/f/${token}`), "but you get the hop");
  } finally {
    app.stop();
    db.close();
  }
});

test("settings offers the toggle and the share controls", async () => {
  const db = freshDb();
  anImage(db, "a cat");

  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signInWithCsrf(app.base);
    const before = await (
      await fetch(`${app.base}/settings`, { headers: { cookie } })
    ).text();
    assert.match(before, /name="public_favourites"/);
    assert.match(before, /action="\/settings\/favourites\/share"/);

    await fetch(`${app.base}/settings/favourites/share`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", cookie },
      body: new URLSearchParams({ _csrf: csrf }).toString(),
      redirect: "manual",
    });

    const token = models(db).Settings.get().favourites_token;
    assert.ok(token, "a token was minted");

    const after = await (
      await fetch(`${app.base}/settings`, { headers: { cookie } })
    ).text();
    assert.match(after, new RegExp(`/f/${token}`), "and the link is shown");
  } finally {
    app.stop();
    db.close();
  }
});
