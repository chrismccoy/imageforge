/**
 * A shared collection's image page
 */

"use strict";

const {
  PNG,
  withFiles,
  NOW,
  freshDb,
  models,
  anImage,
  tokens,
  at,
  startApp,
  signIn,
  shared,
} = require("./setup");

const test = require("node:test");
const assert = require("node:assert/strict");

const { attrTag } = require("../../helpers/dom");

test("the shared collection pages offer a way back when you are signed in", async () => {
  const db = freshDb();
  const { token, ids } = shared(db);

  const app = await startApp(db);
  try {
    const anonGrid = await (await fetch(`${app.base}/c/${token}`)).text();
    const anonImage = await (
      await fetch(`${app.base}/c/${token}/i/${ids[0]}`)
    ).text();
    assert.equal(/fa-gauge-high/.test(anonGrid), false);
    assert.equal(/fa-gauge-high/.test(anonImage), false);

    const cookie = (await signIn(app.base)).cookie;
    const grid = await (
      await fetch(`${app.base}/c/${token}`, { headers: { cookie } })
    ).text();
    const image = await (
      await fetch(`${app.base}/c/${token}/i/${ids[0]}`, { headers: { cookie } })
    ).text();

    assert.match(grid, /fa-gauge-high/);
    assert.match(grid, /Dashboard/);
    assert.match(grid, /href="\/"/);
    assert.match(image, /fa-gauge-high/);
    assert.match(image, /Dashboard/);
  } finally {
    app.stop();
    db.close();
  }
});

test("the way back to the collection is a button, not loose text", async () => {
  const db = freshDb();
  const { token, ids } = shared(db, { title: "Winter campaign 2026" });

  const app = await startApp(db);
  try {
    const html = await (await fetch(`${app.base}/c/${token}/i/${ids[0]}`)).text();
    const back = new RegExp(`<a[^>]*href="/c/${token}"[^>]*>[\\s\\S]*?<\\/a>`).exec(
      html
    )?.[0];
    assert.ok(back, "no back link found");
    assert.match(back, /class="btn btn-quiet btn-sm/);
    assert.match(back, new RegExp(`href="/c/${token}"`));
    assert.match(back, /Back to Winter campaign 2026/);
  } finally {
    app.stop();
    db.close();
  }
});

test("an image's page shows the prompt under its own heading", async () => {
  const db = freshDb();
  const { token, ids } = shared(db, { images: ["a heading test cat"] });

  const app = await startApp(db);
  try {
    const html = await (await fetch(`${app.base}/c/${token}/i/${ids[0]}`)).text();
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

test("every known fact is a chip on an image's page, and an absent one leaves no bare chip", async () => {
  const db = freshDb();
  const { Collection, Generation, Settings } = models(db);
  Settings.update({ public_collections: 1 });
  const collId = Collection.add("Acme Corp rebrand", NOW);
  const imgId = Generation.add({
    filename: `${process.pid}-chip-test.png`,
    prompt: "a chip test cat",
    model: "gpt-image-2",
    size: "1024x1024",
    usage: { total: 700, input: 20, output: 680 },
  });
  Collection.addImage(imgId, collId);
  const token = Collection.share(
    collId,
    "Chip test collection",
    tokens("CHIPTOK001")
  );

  const app = await startApp(db);
  try {
    const html = await (await fetch(`${app.base}/c/${token}/i/${imgId}`)).text();
    const row = attrTag(html, "meta-row", "div");
    assert.ok(row, "no fact row found");
    assert.match(row, /gpt-image-2/);
    assert.match(row, /1024x1024/);
    assert.match(row, /700 tokens/);
    assert.equal(row.includes("$"), false, "no cost chip when the rate is unknown");
  } finally {
    app.stop();
    db.close();
  }
});

test("an image's page offers download, copy prompt and copy link", async () => {
  const db = freshDb();
  const { token, ids } = shared(db, { images: ["a button test cat"] });

  const app = await startApp(db);
  try {
    const html = await (await fetch(`${app.base}/c/${token}/i/${ids[0]}`)).text();

    const copyPrompt = attrTag(html, "data-copy-prompt", "button");
    assert.ok(copyPrompt, "no copy prompt button found");
    assert.match(copyPrompt, /data-prompt="a button test cat"/);

    const copyLink = /<button\b[^>]*\bdata-copy="([^"]*)"[^>]*>/.exec(html);
    assert.ok(copyLink, "no copy link button found");
    assert.equal(copyLink[1], `/c/${token}/i/${ids[0]}`);

    assert.match(html, new RegExp(`href="/c/${token}/i/${ids[0]}/download"`));
    assert.match(html, /copy-link\.js/);
  } finally {
    app.stop();
    db.close();
  }
});

test("copy prompt is absent from an image's page when it has no prompt", async () => {
  const db = freshDb();
  const { Collection, Generation, Settings } = models(db);
  Settings.update({ public_collections: 1 });
  const collId = Collection.add("Acme Corp rebrand", NOW);
  const imgId = Generation.add({
    filename: `${process.pid}-no-prompt.png`,
    prompt: "",
    model: "gpt-image-2",
    size: "1024x1024",
  });
  Collection.addImage(imgId, collId);
  const token = Collection.share(
    collId,
    "No prompt collection",
    tokens("NOPROMPTOK")
  );

  const app = await startApp(db);
  try {
    const html = await (await fetch(`${app.base}/c/${token}/i/${imgId}`)).text();
    assert.equal(html.includes("data-copy-prompt"), false);
  } finally {
    app.stop();
    db.close();
  }
});

test("the picture and its download on an image's page both hang off the visitor's token", async () => {
  const db = freshDb();
  const { Collection } = models(db);
  const { id, token, ids } = shared(db, { images: ["a token property cat"] });

  const app = await startApp(db);
  try {
    const html = await (await fetch(`${app.base}/c/${token}/i/${ids[0]}`)).text();

    assert.match(html, new RegExp(`<img[^>]+src="/c/${token}/i/${ids[0]}[^"]*"`));
    assert.match(html, new RegExp(`href="/c/${token}/i/${ids[0]}/download"`));

    Collection.unshare(id);
    assert.equal((await fetch(`${app.base}/c/${token}/i/${ids[0]}`)).status, 404);
    assert.equal(
      (await fetch(`${app.base}/c/${token}/i/${ids[0]}/download`)).status,
      404
    );
  } finally {
    app.stop();
    db.close();
  }
});

test("an image inside a collection is reachable with its extension", async () => {
  const db = freshDb();
  const { id, token, ids } = shared(db);
  const cleanUp = withFiles(models(db).Collection.allImagesIn(id));

  const app = await startApp(db);
  try {
    const res = await fetch(`${app.base}/c/${token}/i/${ids[0]}.png`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/png");
    assert.equal(Buffer.from(await res.arrayBuffer()).length, PNG.length);
  } finally {
    cleanUp();
    app.stop();
    db.close();
  }
});

test("an extension the collection's image is not is refused", async () => {
  const db = freshDb();
  const { id, token, ids } = shared(db);
  const cleanUp = withFiles(models(db).Collection.allImagesIn(id));

  const app = await startApp(db);
  try {
    assert.equal(
      (await fetch(`${app.base}/c/${token}/i/${ids[0]}.jpg`)).status,
      404
    );
  } finally {
    cleanUp();
    app.stop();
    db.close();
  }
});

test("the bare id is still the page, not the picture", async () => {
  const db = freshDb();
  const { token, ids } = shared(db, { images: ["a golden sunset"] });

  const app = await startApp(db);
  try {
    const res = await fetch(`${app.base}/c/${token}/i/${ids[0]}`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/html/);
    assert.match(await res.text(), /a golden sunset/);
  } finally {
    app.stop();
    db.close();
  }
});

test("the file route still serves the bytes", async () => {
  const db = freshDb();
  const { id, token, ids } = shared(db);
  const cleanUp = withFiles(models(db).Collection.allImagesIn(id));

  const app = await startApp(db);
  try {
    const res = await fetch(`${app.base}/c/${token}/i/${ids[0]}/file`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/png");
  } finally {
    cleanUp();
    app.stop();
    db.close();
  }
});

test("an extension does not reach an image outside the collection", async () => {
  const db = freshDb();
  const { token } = shared(db);
  const outsider = anImage(db, "not yours");

  const app = await startApp(db);
  try {
    assert.equal(
      (await fetch(`${app.base}/c/${token}/i/${outsider}.png`)).status,
      404
    );
    assert.equal((await fetch(`${app.base}/c/${token}/i/999999.png`)).status, 404);
  } finally {
    app.stop();
    db.close();
  }
});

test("the grid points at the extension form", async () => {
  const db = freshDb();
  const { token, ids } = shared(db);

  const app = await startApp(db);
  try {
    const html = await (await fetch(`${app.base}/c/${token}`)).text();
    assert.match(html, new RegExp(`/c/${token}/i/${ids[0]}\\.png`));
  } finally {
    app.stop();
    db.close();
  }
});

test("the old file URL redirects to the extension form", async () => {
  const db = freshDb();
  const { id, token, ids } = shared(db);
  const cleanUp = withFiles(models(db).Collection.allImagesIn(id));

  const app = await startApp(db);
  try {
    const res = await fetch(`${app.base}/c/${token}/i/${ids[0]}/file`, {
      redirect: "manual",
    });

    assert.equal(res.status, 301);
    assert.equal(res.headers.get("location"), `/c/${token}/i/${ids[0]}.png`);
  } finally {
    cleanUp();
    app.stop();
    db.close();
  }
});

test("the image's page is not redirected", async () => {
  const db = freshDb();
  const { token, ids } = shared(db);

  const app = await startApp(db);
  try {
    const res = await fetch(`${app.base}/c/${token}/i/${ids[0]}`, {
      redirect: "manual",
    });
    assert.equal(res.status, 200);
  } finally {
    app.stop();
    db.close();
  }
});

test("the download is not redirected either", async () => {
  const db = freshDb();
  const { id, token, ids } = shared(db);
  const cleanUp = withFiles(models(db).Collection.allImagesIn(id));

  const app = await startApp(db);
  try {
    const res = await fetch(`${app.base}/c/${token}/i/${ids[0]}/download`, {
      redirect: "manual",
    });
    assert.equal(res.status, 200);
  } finally {
    cleanUp();
    app.stop();
    db.close();
  }
});

test("an image outside the collection is not redirected", async () => {
  const db = freshDb();
  const { token } = shared(db);
  const outsider = anImage(db, "not yours");

  const app = await startApp(db);
  try {
    const res = await fetch(`${app.base}/c/${token}/i/${outsider}/file`, {
      redirect: "manual",
    });
    assert.equal(res.status, 404);
  } finally {
    app.stop();
    db.close();
  }
});
