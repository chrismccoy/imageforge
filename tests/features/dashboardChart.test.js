/**
 * The dashboard chart
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
const { dataWidget } = require("../helpers/dom");

const { DAY_MS } = require("../../utils/domain/time");

function models(db) {
  return require("../../models").buildModels(db);
}

async function chartHtml(db) {
  const app = await startApp({ db });
  const cookie = await signIn(app.base);
  const html = await (await fetch(`${app.base}/`, { headers: { cookie } })).text();
  app.stop();
  return dataWidget(html, "output", "section");
}

function fillDay(db, iso, count, model = "gpt-image-1.5") {
  const insert = db.prepare(
    `INSERT INTO generations (filename, prompt, model, size, created_at) VALUES (?, '', ?, '', ?)`
  );
  const insertMany = db.transaction((n) => {
    for (let i = 0; i < n; i += 1) {
      insert.run(`${process.pid}-fill-${iso}-${i}.png`, model, iso);
    }
  });
  insertMany(count);
}

test("the chart draws a bar for every day in the window", async () => {
  const db = freshDb();
  const chart = await chartHtml(db);

  assert.equal((chart.match(/<rect/g) || []).length, 30);
  db.close();
});

test("a quiet day is a bar of no height", async () => {
  const db = freshDb();
  const chart = await chartHtml(db);

  assert.match(chart, /height="0"/);
  db.close();
});

test("the legend says the totals for the window", async () => {
  const db = freshDb();
  const { Generation } = models(db);
  Generation.add({
    filename: `${process.pid}-chart.png`,
    prompt: "a cat",
    model: "gpt-image-1.5",
    size: "1024x1024",
  });

  const chart = await chartHtml(db);
  assert.match(chart, />\s*1\s*<\/b>\s*image/);
  db.close();
});

test("with nothing priced the legend shows no spend", async () => {
  const db = freshDb();
  const { Generation } = models(db);
  Generation.add({
    filename: `${process.pid}-chart2.png`,
    prompt: "a cat",
    model: "gpt-image-1.5",
    size: "1024x1024",
  });

  const chart = await chartHtml(db);
  assert.doesNotMatch(chart, /\$0\.00/);
  db.close();
});

test("two models generating on the same day sum into one bar", async () => {
  const db = freshDb();
  const today = new Date().toISOString().slice(0, 10);
  const at = `${today}T09:00:00.000Z`;

  const { Generation } = models(db);
  const idA = Number(
    Generation.add({
      filename: `${process.pid}-multi-a.png`,
      prompt: "a cat",
      model: "gpt-image-1.5",
      size: "1024x1024",
    })
  );
  const idB = Number(
    Generation.add({
      filename: `${process.pid}-multi-b.png`,
      prompt: "a dog",
      model: "dall-e-3",
      size: "1024x1024",
    })
  );
  db.prepare("UPDATE generations SET created_at = ? WHERE id IN (?, ?)").run(
    at,
    idA,
    idB
  );

  const chart = await chartHtml(db);
  assert.match(chart, new RegExp(`<title>${today}: 2<\\/title>`));
  db.close();
});

test("a day with one image is never drawn as if it were quiet", async () => {
  const db = freshDb();
  const now = Date.now();
  const quietIso = new Date(now - 10 * DAY_MS).toISOString();
  const busyIso = new Date(now - 5 * DAY_MS).toISOString();
  const quietDay = quietIso.slice(0, 10);

  fillDay(db, quietIso, 1);
  fillDay(db, busyIso, 200);

  const chart = await chartHtml(db);

  const rect = new RegExp(
    `<rect[^>]*height="(\\d+)"[^>]*>\\s*<title>${quietDay}: 1<\\/title>`
  ).exec(chart);
  assert.ok(rect, "expected a bar for the one-image day");
  assert.notEqual(rect[1], "0");

  assert.match(chart, /height="0"/);
  db.close();
});
