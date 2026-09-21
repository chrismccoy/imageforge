/**
 * A favourite's own page
 */

"use strict";

const {
  withFiles,
  freshDb,
  models,
  anImage,
  startApp,
  shared,
  at,
} = require("./setup");

const test = require("node:test");
const assert = require("node:assert/strict");

const { attrTag } = require("../../helpers/dom");

test("a starred image is reachable with its extension", async () => {
  const db = freshDb();
  const { ids, token } = shared(db);
  const cleanUp = withFiles(db, ids);

  const app = await startApp(db);
  try {
    const res = await fetch(`${app.base}/f/${token}/i/${ids[0]}.png`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/png");
  } finally {
    cleanUp();
    app.stop();
    db.close();
  }
});

test("an extension the starred image is not is refused", async () => {
  const db = freshDb();
  const { ids, token } = shared(db);
  const cleanUp = withFiles(db, ids);

  const app = await startApp(db);
  try {
    assert.equal(
      (await fetch(`${app.base}/f/${token}/i/${ids[0]}.jpg`)).status,
      404
    );
  } finally {
    cleanUp();
    app.stop();
    db.close();
  }
});

test("an extension does not reach an image that is not starred", async () => {
  const db = freshDb();
  const { token } = shared(db);
  const notStarred = anImage(db, "an unstarred fish");

  const app = await startApp(db);
  try {
    assert.equal(
      (await fetch(`${app.base}/f/${token}/i/${notStarred}.png`)).status,
      404
    );
  } finally {
    app.stop();
    db.close();
  }
});

test("the bare id is still the image's page", async () => {
  const db = freshDb();
  const { ids, token } = shared(db, ["a starred cat"]);

  const app = await startApp(db);
  try {
    const res = await fetch(`${app.base}/f/${token}/i/${ids[0]}`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/html/);
    assert.match(await res.text(), /a starred cat/);
  } finally {
    app.stop();
    db.close();
  }
});

test("the favourites grid points at the extension form", async () => {
  const db = freshDb();
  const { ids, token } = shared(db);

  const app = await startApp(db);
  try {
    const html = await (await fetch(`${app.base}/f/${token}`)).text();
    assert.match(html, new RegExp(`/f/${token}/i/${ids[0]}\\.png`));
  } finally {
    app.stop();
    db.close();
  }
});

test("the old favourites file URL redirects to the extension form", async () => {
  const db = freshDb();
  const { ids, token } = shared(db);
  const cleanUp = withFiles(db, ids);

  const app = await startApp(db);
  try {
    const res = await fetch(`${app.base}/f/${token}/i/${ids[0]}/file`, {
      redirect: "manual",
    });

    assert.equal(res.status, 301);
    assert.equal(res.headers.get("location"), `/f/${token}/i/${ids[0]}.png`);
  } finally {
    cleanUp();
    app.stop();
    db.close();
  }
});

test("an unstarred image is not redirected", async () => {
  const db = freshDb();
  const { token } = shared(db);
  const notStarred = anImage(db, "an unstarred fish");

  const app = await startApp(db);
  try {
    const res = await fetch(`${app.base}/f/${token}/i/${notStarred}/file`, {
      redirect: "manual",
    });
    assert.equal(res.status, 404);
  } finally {
    app.stop();
    db.close();
  }
});

test("the way back to favourites is a button, not loose text", async () => {
  const db = freshDb();
  const { ids, token } = shared(db, ["a back link test cat"]);

  const app = await startApp(db);
  try {
    const html = await (await fetch(`${app.base}/f/${token}/i/${ids[0]}`)).text();
    const back = new RegExp(`<a[^>]*href="/f/${token}"[^>]*>[\\s\\S]*?<\\/a>`).exec(
      html
    )?.[0];
    assert.ok(back, "no back link found");
    assert.match(back, /class="btn btn-quiet btn-sm/);
    assert.match(back, new RegExp(`href="/f/${token}"`));
    assert.match(back, /Back to Favourites/);
  } finally {
    app.stop();
    db.close();
  }
});

test("a favourite's page shows the prompt under its own heading", async () => {
  const db = freshDb();
  const { ids, token } = shared(db, ["a heading test cat"]);

  const app = await startApp(db);
  try {
    const html = await (await fetch(`${app.base}/f/${token}/i/${ids[0]}`)).text();
    const label = attrTag(html, "prompt-label", "p");
    assert.ok(label, "no PROMPT heading found");
    assert.match(label, /Prompt/);

    const text = attrTag(html, "prompt-text", "p");
    assert.ok(text, "no prompt text found");
    assert.match(text, /a heading test cat/);
  } finally {
    app.stop();
    db.close();
  }
});

test("every known fact is a chip on a favourite's page, and an absent one leaves no bare chip", async () => {
  const db = freshDb();
  const { Generation, Settings } = models(db);
  const imgId = Generation.add({
    filename: `${process.pid}-fav-chip-test.png`,
    prompt: "a chip test cat",
    model: "gpt-image-2",
    size: "1024x1024",
    usage: { total: 640, input: 15, output: 625 },
  });
  Generation.toggleFavorite(imgId);
  Settings.update({ public_favourites: 1 });
  const token = Settings.shareFavourites(() => "FAVCHIPTOK");

  const app = await startApp(db);
  try {
    const html = await (await fetch(`${app.base}/f/${token}/i/${imgId}`)).text();
    const row = attrTag(html, "meta-row", "div");
    assert.ok(row, "no fact row found");
    assert.match(row, /gpt-image-2/);
    assert.match(row, /1024x1024/);
    assert.match(row, /640 tokens/);
    assert.equal(row.includes("$"), false, "no cost chip when the rate is unknown");
  } finally {
    app.stop();
    db.close();
  }
});

test("a favourite's page offers download, copy prompt and copy link", async () => {
  const db = freshDb();
  const { ids, token } = shared(db, ["a button test cat"]);

  const app = await startApp(db);
  try {
    const html = await (await fetch(`${app.base}/f/${token}/i/${ids[0]}`)).text();

    const copyPrompt = attrTag(html, "data-copy-prompt", "button");
    assert.ok(copyPrompt, "no copy prompt button found");
    assert.match(copyPrompt, /data-prompt="a button test cat"/);

    const copyLink = /<button\b[^>]*\bdata-copy="([^"]*)"[^>]*>/.exec(html);
    assert.ok(copyLink, "no copy link button found");
    assert.equal(copyLink[1], `/f/${token}/i/${ids[0]}`);

    assert.match(html, new RegExp(`href="/f/${token}/i/${ids[0]}/download"`));
    assert.match(html, /copy-link\.js/);
  } finally {
    app.stop();
    db.close();
  }
});

test("copy prompt is absent from a favourite's page when it has no prompt", async () => {
  const db = freshDb();
  const { Generation, Settings } = models(db);
  const imgId = Generation.add({
    filename: `${process.pid}-fav-no-prompt.png`,
    prompt: "",
    model: "gpt-image-2",
    size: "1024x1024",
  });
  Generation.toggleFavorite(imgId);
  Settings.update({ public_favourites: 1 });
  const token = Settings.shareFavourites(() => "FAVNOPROMPT");

  const app = await startApp(db);
  try {
    const html = await (await fetch(`${app.base}/f/${token}/i/${imgId}`)).text();
    assert.equal(html.includes("data-copy-prompt"), false);
  } finally {
    app.stop();
    db.close();
  }
});

test("the picture and its download on a favourite's page both hang off the visitor's token", async () => {
  const db = freshDb();
  const { Settings } = models(db);
  const { ids, token } = shared(db, ["a token property cat"]);

  const app = await startApp(db);
  try {
    const html = await (await fetch(`${app.base}/f/${token}/i/${ids[0]}`)).text();

    assert.match(html, new RegExp(`<img[^>]+src="/f/${token}/i/${ids[0]}[^"]*"`));
    assert.match(html, new RegExp(`href="/f/${token}/i/${ids[0]}/download"`));

    Settings.unshareFavourites();
    assert.equal((await fetch(`${app.base}/f/${token}/i/${ids[0]}`)).status, 404);
    assert.equal(
      (await fetch(`${app.base}/f/${token}/i/${ids[0]}/download`)).status,
      404
    );
  } finally {
    app.stop();
    db.close();
  }
});
