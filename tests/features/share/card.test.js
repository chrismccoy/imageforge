/**
 * What the share page says about the image
 */

"use strict";

const { freshDb, addGeneration, startApp, useFixtureFile } = require("./setup");

const test = require("node:test");
const assert = require("node:assert/strict");

const buildGeneration = require("../../../models/generation");
const buildModelPrice = require("../../../models/modelPrice");
const buildSettings = require("../../../models/settings");
const { attrTag } = require("../../helpers/dom");

const fixture = useFixtureFile();

test("the share page shows the token total when there is one", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const Settings = buildSettings(db);
  Settings.update({ public_share: 1 });

  Generation.add({
    filename: fixture.name,
    prompt: "a counted cat",
    model: "gpt-image-1.5",
    size: "1024x1024",
    usage: {
      total: 1265,
      input: 15,
      output: 1250,
      inputText: 15,
      inputImage: 0,
      outputText: 194,
      outputImage: 1056,
    },
  });
  Generation.setShareToken(Generation.all()[0].id, "tokcounted");

  const app = await startApp({ db });
  try {
    const html = await (await fetch(`${app.base}/s/tokcounted`)).text();
    assert.match(html, /1,265 tokens/);
  } finally {
    app.stop();
    db.close();
  }
});

test("the share page shows what the image cost when the model has a rate", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const Settings = buildSettings(db);
  const ModelPrice = buildModelPrice(db);
  Settings.update({ public_share: 1 });
  ModelPrice.set("gpt-image-1.5", 5, 40, "2026-01-01T00:00:00.000Z");

  Generation.add({
    filename: fixture.name,
    prompt: "a priced cat",
    model: "gpt-image-1.5",
    usage: { total: 1265, input: 15, output: 1250 },
  });
  Generation.setShareToken(Generation.all()[0].id, "tokpriced1");

  const app = await startApp({ db });
  try {
    const html = await (await fetch(`${app.base}/s/tokpriced1`)).text();
    assert.match(html, /1,265 tokens/);
    assert.match(html, /\$0\.050/);
  } finally {
    app.stop();
    db.close();
  }
});

test("the share page shows no cost when the model has no rate stored", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const Settings = buildSettings(db);
  Settings.update({ public_share: 1 });

  Generation.add({
    filename: fixture.name,
    prompt: "an unpriced cat",
    model: "gpt-image-1.5",
    usage: { total: 1265, input: 15, output: 1250 },
  });
  Generation.setShareToken(Generation.all()[0].id, "tokunpriced");

  const app = await startApp({ db });
  try {
    const html = await (await fetch(`${app.base}/s/tokunpriced`)).text();
    assert.match(html, /1,265 tokens/, "the count is still shown");
    assert.equal(html.includes("$"), false, "but no money is");
  } finally {
    app.stop();
    db.close();
  }
});

test("the share page says nothing about tokens when there is no count", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const Settings = buildSettings(db);
  Settings.update({ public_share: 1 });

  Generation.add({ filename: fixture.name, prompt: "an uncounted cat", size: "" });
  Generation.setShareToken(Generation.all()[0].id, "tokuncounted");

  const app = await startApp({ db });
  try {
    const html = await (await fetch(`${app.base}/s/tokuncounted`)).text();
    assert.equal(html.includes("tokens"), false);
  } finally {
    app.stop();
    db.close();
  }
});

test("the share page shows the prompt under its own heading", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const Settings = buildSettings(db);
  Settings.update({ public_share: 1 });
  Generation.add({
    filename: fixture.name,
    prompt: "a heading test cat",
    model: "gpt-image-1.5",
    size: "1024x1024",
  });
  Generation.setShareToken(Generation.all()[0].id, "tokheading1");

  const app = await startApp({ db });
  try {
    const html = await (await fetch(`${app.base}/s/tokheading1`)).text();
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

test("every known fact is a chip, and an absent one leaves no bare chip", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const Settings = buildSettings(db);
  Settings.update({ public_share: 1 });
  Generation.add({
    filename: fixture.name,
    prompt: "a chip test cat",
    model: "gpt-image-1.5",
    size: "1024x1024",
    usage: { total: 900, input: 10, output: 890 },
  });
  Generation.setShareToken(Generation.all()[0].id, "tokchips001");

  const app = await startApp({ db });
  try {
    const html = await (await fetch(`${app.base}/s/tokchips001`)).text();
    const row = attrTag(html, "meta-row", "div");
    assert.ok(row, "no fact row found");
    assert.match(row, /gpt-image-1\.5/);
    assert.match(row, /1024x1024/);
    assert.match(row, /900 tokens/);
    assert.equal(row.includes("$"), false, "no cost chip when the rate is unknown");
  } finally {
    app.stop();
    db.close();
  }
});

test("the share page offers download, copy prompt and copy link", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const Settings = buildSettings(db);
  Settings.update({ public_share: 1 });
  Generation.add({
    filename: fixture.name,
    prompt: "a button test cat",
    model: "gpt-image-1.5",
    size: "1024x1024",
  });
  Generation.setShareToken(Generation.all()[0].id, "tokbuttons1");

  const app = await startApp({ db });
  try {
    const html = await (await fetch(`${app.base}/s/tokbuttons1`)).text();

    const download = attrTag(html, "download", "a");
    assert.ok(download, "no download link found");
    assert.match(download, /Download/);

    const copyPrompt = attrTag(html, "data-copy-prompt", "button");
    assert.ok(copyPrompt, "no copy prompt button found");
    assert.match(copyPrompt, /data-prompt="a button test cat"/);

    const copyLink = /<button\b[^>]*\bdata-copy="([^"]*)"[^>]*>/.exec(html);
    assert.ok(copyLink, "no copy link button found");
    assert.equal(copyLink[1], "/s/tokbuttons1");

    assert.match(html, /copy-link\.js/);
  } finally {
    app.stop();
    db.close();
  }
});

test("copy prompt is absent when the image has no prompt", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const Settings = buildSettings(db);
  Settings.update({ public_share: 1 });
  Generation.add({
    filename: fixture.name,
    prompt: "",
    model: "gpt-image-1.5",
    size: "1024x1024",
  });
  Generation.setShareToken(Generation.all()[0].id, "toknoprompt1");

  const app = await startApp({ db });
  try {
    const html = await (await fetch(`${app.base}/s/toknoprompt1`)).text();
    assert.equal(html.includes("data-copy-prompt"), false);
  } finally {
    app.stop();
    db.close();
  }
});

test("the picture and its download both hang off the visitor's token", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const Settings = buildSettings(db);
  Settings.update({ public_share: 1 });
  const id = addGeneration(Generation, fixture.name, "a token property cat");
  Generation.setShareToken(id, "toktokenprop");

  const app = await startApp({ db });
  try {
    const html = await (await fetch(`${app.base}/s/toktokenprop`)).text();

    assert.match(html, /<img[^>]+src="\/i\/toktokenprop[^"]*"/);

    const download = attrTag(html, "download", "a");
    assert.match(download, /href="\/i\/toktokenprop[^"]*"/);

    Generation.clearShareToken(id);
    assert.equal((await fetch(`${app.base}/i/toktokenprop`)).status, 404);
    assert.equal((await fetch(`${app.base}/s/toktokenprop`)).status, 404);
  } finally {
    app.stop();
    db.close();
  }
});

test("the share page degrades cleanly with no prompt, no tokens and no cost", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const Settings = buildSettings(db);
  Settings.update({ public_share: 1 });
  const id = addGeneration(Generation, fixture.name, "");
  Generation.setShareToken(id, "tokbareall1");

  const app = await startApp({ db });
  try {
    const html = await (await fetch(`${app.base}/s/tokbareall1`)).text();

    assert.equal(
      attrTag(html, "prompt-label", "p"),
      null,
      "no PROMPT heading when there is no prompt"
    );
    assert.equal(
      html.includes("data-copy-prompt"),
      false,
      "no copy prompt button when there is no prompt"
    );

    const row = attrTag(html, "meta-row", "div");
    assert.ok(row, "no fact row found");
    assert.match(row, /1\.5/, "the known model still shows");
    assert.match(row, /1024x1024/, "the known size still shows");
    assert.equal(row.includes("tokens"), false, "no tokens chip");
    assert.equal(row.includes("$"), false, "no bare cost chip");
    assert.equal(
      (row.match(/class="chip"/g) || []).length,
      3,
      "only the three known facts are chips — model, size and date"
    );
    assert.doesNotMatch(
      row,
      /<\/span>\s*[^\s<][^<]*<span class="chip"/,
      "no stray separator left between the chips that do show"
    );

    assert.match(html, /<img[^>]+src="\/i\/tokbareall1[^"]*"/);
    const download = attrTag(html, "download", "a");
    assert.match(download, /href="\/i\/tokbareall1[^"]*"/);
  } finally {
    app.stop();
    db.close();
  }
});
