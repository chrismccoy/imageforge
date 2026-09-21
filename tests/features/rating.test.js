/**
 * Rating tests
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";

const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const schema = require("../../db/schema");

function freshDb() {
  const db = new Database(":memory:");
  schema.init(db);
  return db;
}

function prompts(db) {
  return require("../../models/prompt")(db);
}

test("a new prompt is unrated, which is not the same as zero", () => {
  const db = freshDb();
  const Prompt = prompts(db);
  Prompt.add("A", "x");

  assert.equal(Prompt.page({ limit: 10, offset: 0 })[0].rating, null);
});

test("a rating of one to five is stored and reported", () => {
  const db = freshDb();
  const Prompt = prompts(db);
  const id = Prompt.add("A", "x");

  for (const value of [1, 2, 3, 4, 5]) {
    assert.equal(Prompt.setRating(id, value), value);
    assert.equal(Prompt.get(id).rating, value);
  }
});

test("zero clears the rating", () => {
  const db = freshDb();
  const Prompt = prompts(db);
  const id = Prompt.add("A", "x");

  Prompt.setRating(id, 4);
  assert.equal(Prompt.setRating(id, 0), null);
  assert.equal(Prompt.get(id).rating, null);
});

test("a rating outside the range leaves the stored value alone", () => {
  const db = freshDb();
  const Prompt = prompts(db);
  const id = Prompt.add("A", "x");
  Prompt.setRating(id, 3);

  for (const bad of [6, -1, 2.5, "4", NaN, null, undefined]) {
    assert.equal(Prompt.setRating(id, bad), 3, `${bad} should be refused`);
  }
  assert.equal(Prompt.get(id).rating, 3);
});

test("sorting by rating puts the best first and the unrated last", () => {
  const db = freshDb();
  const Prompt = prompts(db);
  const a = Prompt.add("A", "x");
  const b = Prompt.add("B", "x");
  Prompt.add("C", "x");

  Prompt.setRating(a, 2);
  Prompt.setRating(b, 5);

  assert.deepEqual(
    Prompt.page({ sort: "rating", limit: 10, offset: 0 }).map((r) => r.name),
    ["B", "A", "C"]
  );
});

test("an unknown sort falls back to name order", () => {
  const db = freshDb();
  const Prompt = prompts(db);
  Prompt.add("B", "x");
  Prompt.add("A", "x");

  for (const sort of ["banana", "name; DROP TABLE prompts", "", null]) {
    assert.deepEqual(
      Prompt.page({ sort, limit: 10, offset: 0 }).map((r) => r.name),
      ["A", "B"],
      `${sort} should fall back`
    );
  }

  assert.equal(Prompt.count(), 2);
});

const { createApp } = require("../../server");

async function startApp(db) {
  const app = createApp({ db });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    stop: () => server.close(),
  };
}

function cookieFrom(res) {
  const set = res.headers.getSetCookie();
  return set && set.length ? set.map((c) => c.split(";")[0]).join("; ") : null;
}

async function signIn(base) {
  const page = await fetch(`${base}/login`);
  const loginCsrf = /name="_csrf" value="([^"]+)"/.exec(await page.text())[1];
  const loginCookie = cookieFrom(page);

  const res = await fetch(`${base}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      cookie: loginCookie,
    },
    body: `_csrf=${loginCsrf}&username=admin&password=test-pass`,
    redirect: "manual",
  });
  const cookie = cookieFrom(res) || loginCookie;

  const after = await fetch(`${base}/prompts`, { headers: { cookie } });
  const csrf = /name="csrf-token" content="([^"]*)"/.exec(await after.text())[1];
  return { cookie, csrf };
}

test("the rating endpoint sets, clears and reports", async () => {
  const db = freshDb();
  const Prompt = prompts(db);
  const id = Prompt.add("A", "x");

  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);
    const rate = (value) =>
      fetch(`${app.base}/prompts/${id}/rating/${value}`, {
        method: "POST",
        headers: { cookie, "x-csrf-token": csrf },
      });

    const set = await rate(4);
    assert.equal(set.status, 200);
    assert.deepEqual(await set.json(), { rating: 4 });

    const cleared = await rate(0);
    assert.deepEqual(await cleared.json(), { rating: null });
  } finally {
    app.stop();
    db.close();
  }
});

test("rating an unknown prompt is a 404", async () => {
  const db = freshDb();
  const app = await startApp(db);
  try {
    const { cookie, csrf } = await signIn(app.base);
    const res = await fetch(`${app.base}/prompts/9999/rating/3`, {
      method: "POST",
      headers: { cookie, "x-csrf-token": csrf },
    });
    assert.equal(res.status, 404);
  } finally {
    app.stop();
    db.close();
  }
});

test("the prompts page shows stars and a rating sort link", async () => {
  const db = freshDb();
  const Prompt = prompts(db);
  const id = Prompt.add("A", "x");
  Prompt.setRating(id, 3);

  const app = await startApp(db);
  try {
    const { cookie } = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/prompts`, { headers: { cookie } })
    ).text();

    assert.match(html, /data-rating-group/);
    assert.match(html, /href="\/prompts\?sort=rating"/);
    assert.match(html, /src="\/js\/rating\.js"/);
  } finally {
    app.stop();
    db.close();
  }
});
