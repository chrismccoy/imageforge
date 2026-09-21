/**
 * The dashboard usage
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

test("the dashboard renders with nothing to report", async () => {
  const db = freshDb();
  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const res = await fetch(`${app.base}/`, { headers: { cookie } });
    assert.equal(res.status, 200);

    const html = await res.text();
    assert.match(html, /Dashboard/);
    assert.match(html, /Nothing generated yet/);
  } finally {
    app.stop();
    db.close();
  }
});

test("the dashboard reports per model, with cost only where priced", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const ModelPrice = require("../../models/modelPrice")(db);

  Generation.add({
    filename: "a.png",
    prompt: "",
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
  Generation.add({
    filename: "b.png",
    prompt: "",
    model: "gpt-image-1.5",
    size: "",
    usage: {
      total: 500000,
      input: 500000,
      output: 0,
      inputText: null,
      inputImage: null,
      outputText: null,
      outputImage: null,
    },
  });
  ModelPrice.set("gpt-image-2", 10, 40, new Date().toISOString());

  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/`, { headers: { cookie } })
    ).text();

    const byModel = /data-widget="by-model"[\s\S]*?<\/section>/.exec(html)[0];
    assert.match(byModel, /gpt-image-2/);
    assert.match(byModel, /gpt-image-1\.5/);
    assert.match(byModel, /\$10\.00/);
    assert.equal((byModel.match(/\$/g) || []).length, 1);

    const spend = /data-widget="spend"[\s\S]*?<\/section>/.exec(html)[0];
    assert.match(spend, /\$10\.00/);
  } finally {
    app.stop();
    db.close();
  }
});

test("the usage page needs a login", async () => {
  const db = freshDb();
  const app = await startApp({ db });
  try {
    const res = await fetch(`${app.base}/stats`, { redirect: "manual" });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/login");
  } finally {
    app.stop();
    db.close();
  }
});

test("a priced model with no recorded tokens reports no cost, not zero", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const ModelPrice = require("../../models/modelPrice")(db);

  Generation.add({ filename: "a.png", prompt: "", model: "gpt-image-2", size: "" });
  ModelPrice.set("gpt-image-2", 10, 40, new Date().toISOString());

  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/stats`, { headers: { cookie } })
    ).text();

    assert.equal(html.includes("$0.00"), false);
    assert.match(html, /—/);
  } finally {
    app.stop();
    db.close();
  }
});
