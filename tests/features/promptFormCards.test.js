/**
 * The prompt form's side cards
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const { startApp, signIn, freshDb, uploadFixture } = require("../helpers/app");

const PIN_ORDER_FILE = path.join(
  __dirname,
  "..",
  "..",
  "public",
  "js",
  "pin-order.js"
);
const PIN_FILE = path.join(__dirname, "..", "..", "public", "js", "pin.js");
const RATING_FILE = path.join(__dirname, "..", "..", "public", "js", "rating.js");

function models(db) {
  return require("../../models").buildModels(db);
}

async function editPage(db, id) {
  const app = await startApp({ db });
  const cookie = await signIn(app.base);
  const html = await (
    await fetch(`${app.base}/prompts/${id}/edit`, { headers: { cookie } })
  ).text();
  app.stop();
  return html;
}

test("the edit form shows the prompt's rating", async () => {
  const db = freshDb();
  const { Prompt } = models(db);
  const id = Prompt.add("One", "a cat", null);
  Prompt.setRating(id, 4);

  const html = await editPage(db, id);
  const card = /data-widget="prompt-rating"[\s\S]*?<\/section>/.exec(html)[0];

  assert.equal((card.match(/data-star=/g) || []).length, 5, "five stars to click");
  assert.match(card, /data-rating="4"/);
  db.close();
});

test("the edit form shows what has been made from the prompt", async () => {
  const db = freshDb();
  const { Prompt, Generation } = models(db);
  const id = Prompt.add("One", "a cat", null);
  const file = uploadFixture("promptcard");
  Generation.add({
    filename: file.filename,
    prompt: "a cat",
    model: "gpt-image-1.5",
    size: "1024x1024",
    prompt_id: id,
  });

  try {
    const html = await editPage(db, id);
    const card = /data-widget="prompt-images"[\s\S]*?<\/section>/.exec(html)[0];

    assert.match(card, new RegExp(file.filename));
    assert.match(
      card,
      /href="\/generations\?prompt=\d+"/,
      "a way through to all of them"
    );
  } finally {
    file.remove();
    db.close();
  }
});

test("a prompt with no images says so", async () => {
  const db = freshDb();
  const { Prompt } = models(db);
  const id = Prompt.add("Unused", "a cat", null);

  const html = await editPage(db, id);
  const card = /data-widget="prompt-images"[\s\S]*?<\/section>/.exec(html)[0];

  assert.match(card, /Nothing has been generated/);
  db.close();
});

test("the edit form can pin the prompt", async () => {
  const db = freshDb();
  const { Prompt } = models(db);
  const id = Prompt.add("One", "a cat", null);
  Prompt.setPinned(id, 1);

  const html = await editPage(db, id);
  const card = /data-widget="prompt-pin"[\s\S]*?<\/section>/.exec(html)[0];

  assert.match(card, /data-pin/);
  assert.match(card, /aria-pressed="true"/);
  db.close();
});

test("the add form carries none of the three cards", async () => {
  const db = freshDb();
  const app = await startApp({ db });
  const cookie = await signIn(app.base);
  const html = await (
    await fetch(`${app.base}/prompts/new`, { headers: { cookie } })
  ).text();
  app.stop();

  assert.doesNotMatch(html, /data-widget="prompt-rating"/);
  assert.doesNotMatch(html, /data-widget="prompt-images"/);
  assert.doesNotMatch(html, /data-widget="prompt-pin"/);
  db.close();
});

function stubPinButton({ id, pinned }) {
  const attrs = {
    "data-pin": "",
    "data-prompt-id": String(id),
    "aria-pressed": pinned ? "true" : "false",
  };
  const classes = new Set([pinned ? "text-brand-600" : "text-slate-300"]);

  const button = {
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
    setAttribute: (name, value) => {
      attrs[name] = String(value);
    },
    classList: {
      toggle(name, on) {
        if (on) classes.add(name);
        else classes.delete(name);
      },
      contains: (name) => classes.has(name),
    },
    focus() {},
    closest(selector) {
      return selector === "[data-pin]" ? button : null;
    },
  };
  return button;
}

function loadPinOnPromptForm() {
  const clickListeners = [];
  const asked = [];
  let reply = { pinned: true };

  const sandbox = {
    document: {
      addEventListener(name, fn) {
        if (name === "click") clickListeners.push(fn);
      },
      querySelector: () => null,
      querySelectorAll: () => [],
    },
    window: {
      ImageForgeApi: {
        post(url, body) {
          asked.push({ url, body });
          return Promise.resolve(reply);
        },
        notice() {},
      },
    },
    console,
  };
  vm.runInNewContext(fs.readFileSync(PIN_ORDER_FILE, "utf8"), sandbox);
  vm.runInNewContext(fs.readFileSync(PIN_FILE, "utf8"), sandbox);

  return {
    asked,
    setReply(value) {
      reply = value;
    },
    async click(button) {
      const event = { target: button };
      for (const fn of clickListeners) await fn(event);
    },
  };
}

test("the pin button works on a page with no [data-prompt-rows] (the prompt form)", async () => {
  const button = stubPinButton({ id: 7, pinned: false });
  const page = loadPinOnPromptForm();
  page.setReply({ pinned: true });

  await page.click(button);

  assert.equal(page.asked.length, 1, "the click sent a request");
  assert.equal(page.asked[0].url, "/prompts/7/pin");
  assert.equal(
    button.getAttribute("aria-pressed"),
    "true",
    "the button's state flipped"
  );
  assert.ok(button.classList.contains("text-brand-600"));
});

function stubStar(value) {
  const classes = new Set(["text-slate-300"]);
  const listeners = [];
  return {
    getAttribute: (name) => (name === "data-star" ? String(value) : null),
    addEventListener(name, fn) {
      if (name === "click") listeners.push(fn);
    },
    classList: {
      toggle(name, on) {
        if (on) classes.add(name);
        else classes.delete(name);
      },
      contains: (name) => classes.has(name),
    },
    async click() {
      for (const fn of listeners) await fn();
    },
  };
}

function stubRatingGroup({ id, rating }) {
  const attrs = {
    "data-rating-group": "",
    "data-prompt-id": String(id),
    "data-rating": rating ? String(rating) : "",
  };
  const stars = [1, 2, 3, 4, 5].map(stubStar);

  return {
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
    setAttribute: (name, value) => {
      attrs[name] = String(value);
    },
    querySelectorAll: (selector) => (selector === "[data-star]" ? stars : []),
    stars,
  };
}

function loadRatingOnPromptForm(group) {
  const asked = [];
  let reply = { rating: 3 };

  const sandbox = {
    document: {
      querySelectorAll: (selector) =>
        selector === "[data-rating-group]" ? [group] : [],
    },
    window: {
      ImageForgeApi: {
        post(url) {
          asked.push({ url });
          return Promise.resolve(reply);
        },
        notice() {},
      },
    },
    console,
  };
  vm.runInNewContext(fs.readFileSync(RATING_FILE, "utf8"), sandbox);

  return {
    asked,
    setReply(value) {
      reply = value;
    },
  };
}

test("the rating stars work on a page with no [data-prompt-rows] (the prompt form)", async () => {
  const group = stubRatingGroup({ id: 9, rating: 0 });
  const page = loadRatingOnPromptForm(group);
  page.setReply({ rating: 3 });

  await group.stars[2].click(); 

  assert.equal(page.asked.length, 1, "the click sent a request");
  assert.equal(page.asked[0].url, "/prompts/9/rating/3");
  assert.equal(group.getAttribute("data-rating"), "3");
  assert.ok(group.stars[2].classList.contains("text-amber-400"));
  assert.ok(!group.stars[3].classList.contains("text-amber-400"));
});
