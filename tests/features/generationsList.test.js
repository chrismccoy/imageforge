/**
 * The generations list
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.PUBLIC_SHARE = "";
process.env.PUBLIC_GALLERY = "";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";

const test = require("node:test");
const assert = require("node:assert/strict");

const buildGeneration = require("../../models/generation");
const { freshDb, startApp, signIn } = require("../helpers/app");

test("a generations card shows the token total, and omits it when absent", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);

  Generation.add({
    filename: "counted.png",
    prompt: "a counted cat",
    model: "gpt-image-2",
    size: "1024x1024",
    usage: {
      total: 211,
      input: 15,
      output: 196,
      inputText: 15,
      inputImage: 0,
      outputText: 0,
      outputImage: 196,
    },
  });
  Generation.add({
    filename: "uncounted.png",
    prompt: "an uploaded cat",
    size: "",
  });

  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/generations`, { headers: { cookie } })
    ).text();

    assert.match(html, /211 tokens/);
    assert.equal(html.match(/tokens</g).length, 1);
  } finally {
    app.stop();
    db.close();
  }
});

test("searching narrows the generations list", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  Generation.add({ filename: "a.png", prompt: "a misty Tokyo alley", size: "" });
  Generation.add({ filename: "b.png", prompt: "a red bicycle", size: "" });

  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/generations?q=tokyo`, { headers: { cookie } })
    ).text();

    assert.match(html, /a misty Tokyo alley/);
    assert.equal(html.includes("a red bicycle"), false);
    assert.match(html, /1 of 2/);
    assert.match(html, /name="q"[^>]*value="tokyo"/);
  } finally {
    app.stop();
    db.close();
  }
});

test("a search that matches nothing says so, rather than looking empty", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  Generation.add({ filename: "a.png", prompt: "a red bicycle", size: "" });

  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/generations?q=zzzz`, { headers: { cookie } })
    ).text();

    assert.match(html, /No generations match/);
    assert.equal(html.includes("No saved generations yet"), false);
  } finally {
    app.stop();
    db.close();
  }
});

test("an empty list with no search keeps the original wording", async () => {
  const db = freshDb();
  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/generations`, { headers: { cookie } })
    ).text();
    assert.match(html, /No saved generations yet/);
  } finally {
    app.stop();
    db.close();
  }
});

test("paging links keep the search term", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const Settings = require("../../models/settings")(db);
  Settings.update({ page_size: "2" });
  for (let i = 0; i < 5; i += 1) {
    Generation.add({ filename: `cat${i}.png`, prompt: "a cat", size: "" });
  }

  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const first = await (
      await fetch(`${app.base}/generations?q=cat`, { headers: { cookie } })
    ).text();
    assert.match(first, /href="\/generations\/page\/2\?q=cat"/);

    const second = await (
      await fetch(`${app.base}/generations/page/2?q=cat`, { headers: { cookie } })
    ).text();
    assert.match(second, /name="q"[^>]*value="cat"/);
    assert.match(second, /Page 2 of 3/);
  } finally {
    app.stop();
    db.close();
  }
});

test("a search term is escaped where it is echoed back", async () => {
  const db = freshDb();
  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/generations?q=%3Cscript%3E`, { headers: { cookie } })
    ).text();
    assert.equal(html.includes("<script>alert"), false);
    assert.match(html, /&lt;script&gt;/);
  } finally {
    app.stop();
    db.close();
  }
});

test("each empty state says which filter emptied the list", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  Generation.add({ filename: "a.png", prompt: "a cat", size: "" });

  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const get = (path) =>
      fetch(`${app.base}${path}`, { headers: { cookie } }).then((r) => r.text());

    assert.match(await get("/generations?fav=1"), /No favourites yet/);
    assert.match(await get("/generations?q=zzz&fav=1"), /No favourites match/);
    assert.match(await get("/generations?q=zzz"), /No generations match/);
  } finally {
    app.stop();
    db.close();
  }
});

test("the upload page offers a drop zone without losing the file input", async () => {
  const db = freshDb();
  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/upload`, { headers: { cookie } })
    ).text();

    assert.match(html, /<button[^>]*data-drop-zone[^>]*\shidden[\s>]/);
    assert.doesNotMatch(html, /data-drop-zone[^>]*class="[^"]*\bhidden\b/);
    assert.match(html, /<input[^>]*id="image"[^>]*type="file"/);
    assert.match(html, /src="\/js\/upload-drop\.js"/);

    const { UPLOAD_MAX_BYTES } = require("../../config/limits");
    assert.match(html, new RegExp(`data-max-bytes="${UPLOAD_MAX_BYTES}"`));
  } finally {
    app.stop();
    db.close();
  }
});

test("a card shows cost beside the tokens once the model is priced", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const ModelPrice = require("../../models/modelPrice")(db);

  Generation.add({
    filename: "a.png",
    prompt: "a cat",
    model: "gpt-image-2",
    size: "",
    usage: {
      total: 1000000,
      input: 1000000,
      output: 0,
      inputText: null,
      inputImage: null,
      outputText: null,
      outputImage: null,
    },
  });

  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const get = () =>
      fetch(`${app.base}/generations`, { headers: { cookie } }).then((r) =>
        r.text()
      );

    const before = await get();
    assert.match(before, /1,000,000 tokens/);
    assert.equal(before.includes("$"), false);

    ModelPrice.set("gpt-image-2", 10, 40, new Date().toISOString());

    const after = await get();
    assert.match(after, /1,000,000 tokens · \$10\.00/);
  } finally {
    app.stop();
    db.close();
  }
});

test("a card with no token counts shows no chip, priced or not", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const ModelPrice = require("../../models/modelPrice")(db);
  ModelPrice.set("gpt-image-2", 10, 40, new Date().toISOString());

  Generation.add({
    filename: "a.png",
    prompt: "a cat",
    model: "gpt-image-2",
    size: "",
  });

  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/generations`, { headers: { cookie } })
    ).text();

    assert.equal(html.includes("tokens"), false);
    assert.equal(html.includes("$"), false);
  } finally {
    app.stop();
    db.close();
  }
});
