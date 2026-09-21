/**
 * Pinned prompts
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
const { buildModels } = require("../../models");
const buildController = require("../../controllers/promptsController");
const { toExport } = require("../../utils/domain/promptTransfer");

function freshDb() {
  const db = new Database(":memory:");
  schema.init(db);
  return db;
}

function withPrompts() {
  const db = freshDb();
  const models = buildModels(db);
  const { Prompt } = models;

  const alpha = Prompt.add("Alpha", "first by name");
  const middle = Prompt.add("Middle", "second by name");
  const zulu = Prompt.add("Zulu", "last by name");

  Prompt.setRating(alpha, 5);
  Prompt.setRating(middle, 1);

  return { db, models, Prompt, alpha, middle, zulu };
}

function names(rows) {
  return rows.map((row) => row.name).join(",");
}

const PAGE = { limit: 50, offset: 0 };

test("a fresh database has the column, and nothing is pinned", () => {
  const db = freshDb();
  const columns = db
    .prepare("PRAGMA table_info(prompts)")
    .all()
    .map((column) => column.name);

  assert.ok(columns.includes("pinned"));
  const { Prompt } = buildModels(db);
  const id = Prompt.add("A", "x");
  assert.equal(Prompt.get(id).pinned, 0);
});

test("pinning is stored, and says what it stored", () => {
  const { Prompt, zulu } = withPrompts();

  assert.equal(Prompt.setPinned(zulu, true), 1, "it answers the new state");
  assert.equal(Prompt.get(zulu).pinned, 1);

  assert.equal(Prompt.setPinned(zulu, false), 0);
  assert.equal(Prompt.get(zulu).pinned, 0);
});

test("pinning one prompt leaves the others alone", () => {
  const { Prompt, alpha, zulu } = withPrompts();
  Prompt.setPinned(zulu, true);

  assert.equal(Prompt.get(alpha).pinned, 0);
});

test("a pinned prompt leads the list, whatever its name", () => {
  const { Prompt, zulu } = withPrompts();
  Prompt.setPinned(zulu, true);

  assert.equal(names(Prompt.page(PAGE)), "Zulu,Alpha,Middle");
});

test("a pin wins over the rating sort too", () => {
  const { Prompt, zulu } = withPrompts();
  Prompt.setPinned(zulu, true);

  assert.equal(
    names(Prompt.page({ ...PAGE, sort: "rating" })),
    "Zulu,Alpha,Middle"
  );
});

test("pinned prompts are among themselves in the usual order", () => {
  const { Prompt, middle, zulu } = withPrompts();
  Prompt.setPinned(zulu, true);
  Prompt.setPinned(middle, true);

  assert.equal(names(Prompt.page(PAGE)), "Middle,Zulu,Alpha");
});

test("a pin leads the search results it belongs to, not the whole list", () => {
  const { Prompt, zulu } = withPrompts();
  Prompt.setPinned(zulu, true);

  assert.equal(names(Prompt.page({ ...PAGE, search: "%first%" })), "Alpha");
});

test("the picker on the Generate page leads with the pins", () => {
  const { Prompt, zulu } = withPrompts();
  Prompt.setPinned(zulu, true);

  assert.equal(names(Prompt.all()), "Zulu,Alpha,Middle");
});

test("a pin stays at home: it is not carried into an export", () => {
  const { Prompt, zulu } = withPrompts();
  Prompt.setPinned(zulu, true);

  const file = toExport(Prompt.all(), "2026-08-14T00:00:00.000Z");
  const exported = file.prompts.find((row) => row.name === "Zulu");

  assert.ok(exported, "the prompt itself travels");
  assert.equal(
    Object.prototype.hasOwnProperty.call(exported, "pinned"),
    false,
    "but where it sits in one install is that install's business"
  );
});

function fakeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test("the endpoint pins and unpins, and says what is now true", () => {
  const { models, zulu } = withPrompts();
  const ctrl = buildController({ models });

  const on = fakeRes();
  ctrl.pin({ params: { id: String(zulu) }, body: { pinned: "1" } }, on);
  assert.deepEqual(on.body, { pinned: 1 });
  assert.equal(models.Prompt.get(zulu).pinned, 1);

  const off = fakeRes();
  ctrl.pin({ params: { id: String(zulu) }, body: { pinned: "" } }, off);
  assert.deepEqual(off.body, { pinned: 0 });
});

test("pinning something that is not there is a 404, not a crash", () => {
  const { models } = withPrompts();
  const ctrl = buildController({ models });

  const res = fakeRes();
  ctrl.pin({ params: { id: "9999" }, body: { pinned: "1" } }, res);
  assert.equal(res.statusCode, 404);
});

const { startApp, signIn } = require("../helpers/app");

async function promptsPage(db) {
  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const res = await fetch(`${app.base}/prompts`, { headers: { cookie } });
    return await res.text();
  } finally {
    app.stop();
  }
}

test("every row offers a pin, and says whether it is on", async () => {
  const { db, Prompt, zulu } = withPrompts();
  Prompt.setPinned(zulu, true);

  const html = await promptsPage(db);
  const buttons = html.match(/<button[^>]*data-pin[^>]*>/g) || [];

  assert.equal(buttons.length, 3, "one per prompt");
  const pinned = buttons.filter((tag) => /aria-pressed="true"/.test(tag));
  const unpinned = buttons.filter((tag) => /aria-pressed="false"/.test(tag));
  assert.equal(pinned.length, 1, "and exactly the pinned one is pressed");
  assert.equal(unpinned.length, 2);
  assert.match(html, /src="\/js\/pin\.js"/, "the page loads the toggle");

  assert.match(buttons[0], /<button/);
  const icons =
    html.match(/<button[^>]*data-pin[^>]*>\s*<i class="fa-solid fa-thumbtack"/g) ||
    [];
  assert.equal(icons.length, 3, "each pin is an icon that takes its colour");

  assert.match(pinned[0], /text-brand-600/, "the pinned pin is coloured in");
  assert.doesNotMatch(pinned[0], /text-slate-300/);
  unpinned.forEach((tag) => {
    assert.match(tag, /text-slate-300/, "an unpinned pin is greyed");
    assert.doesNotMatch(tag, /text-brand-600/);
  });
  db.close();
});

test("the pinned prompt is drawn first on the page", async () => {
  const { db, Prompt, zulu } = withPrompts();
  Prompt.setPinned(zulu, true);

  const html = await promptsPage(db);
  assert.ok(
    html.indexOf("last by name") < html.indexOf("first by name"),
    "the pin leads the table, not just the query"
  );
  db.close();
});

const fs = require("fs");
const path = require("path");
const vm = require("vm");

function loadPin() {
  const sandbox = {
    document: {
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener() {},
    },
    window: { ImageForgeApi: { post: () => Promise.resolve({}), notice() {} } },
    console,
  };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, "..", "..", "public", "js", "pin-order.js"),
      "utf8"
    ),
    sandbox
  );
  return sandbox.window.ImageForgePinOrder;
}

function order(rows) {
  return rows.map((row) => row.key).join(",");
}

test("pinned rows come first, and the rest keep the order they were in", () => {
  const { sortRows } = loadPin();

  const rows = [
    { pinned: false, key: "alpha" },
    { pinned: true, key: "zulu" },
    { pinned: false, key: "beta" },
  ];

  assert.equal(order(sortRows(rows)), "zulu,alpha,beta");
});

test("two pins are among themselves in the order the server sorted them", () => {
  const { sortRows } = loadPin();

  const rows = [
    { pinned: true, key: "zulu" },
    { pinned: false, key: "alpha" },
    { pinned: true, key: "beta" },
  ];

  assert.equal(order(sortRows(rows)), "beta,zulu,alpha");
});

test("unpinning puts a row back where it belongs, not at the end", () => {
  const { sortRows } = loadPin();

  const rows = [
    { pinned: false, key: "zulu" },
    { pinned: false, key: "alpha" },
    { pinned: false, key: "beta" },
  ];

  assert.equal(order(sortRows(rows)), "alpha,beta,zulu");
});

test("a key the server built for the rating sort orders by rating", () => {
  const { sortRows } = loadPin();

  const rows = [
    { pinned: false, key: "1|00|unrated one" },
    { pinned: false, key: "0|00|five star" },
    { pinned: false, key: "0|04|one star" },
  ];

  assert.equal(
    order(sortRows(rows)),
    "0|00|five star,0|04|one star,1|00|unrated one"
  );
});

test("sorting does not disturb the list it was given", () => {
  const { sortRows } = loadPin();

  const rows = [
    { pinned: false, key: "alpha" },
    { pinned: true, key: "zulu" },
  ];
  sortRows(rows);

  assert.equal(order(rows), "alpha,zulu", "the caller's array is left alone");
});
