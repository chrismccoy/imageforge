/**
 * Generate page: saving, and which prompt a batch belongs to
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const FILE = path.join(__dirname, "..", "..", "public", "js", "generate.js");
const BATCH_FILE = path.join(
  __dirname,
  "..",
  "..",
  "public",
  "js",
  "generate-batch.js"
);

function node(tag) {
  return {
    tag,
    children: [],
    parent: null,
    attrs: {},
    listeners: {},
    style: {},
    className: "",
    textContent: "",
    src: "",
    alt: "",
    type: "",
    value: "",
    hidden: false,
    disabled: false,
    checked: false,
    options: [],
    selectedIndex: -1,

    addEventListener(name, fn) {
      (this.listeners[name] = this.listeners[name] || []).push(fn);
    },

    click() {
      (this.listeners.click || []).forEach((fn) => fn());
    },

    setAttribute(name, value) {
      this.attrs[name] = String(value);
    },

    getAttribute(name) {
      return name in this.attrs ? this.attrs[name] : null;
    },

    appendChild(child) {
      child.parent = this;
      this.children.push(child);
      return child;
    },

    replaceChildren(...kids) {
      this.children.forEach((child) => {
        child.parent = null;
      });
      kids.forEach((child) => {
        child.parent = this;
      });
      this.children = kids;
    },

    remove() {
      if (!this.parent) return;
      this.parent.children = this.parent.children.filter((child) => child !== this);
      this.parent = null;
    },

    querySelector(selector) {
      const attribute = /^\[([^\]]+)\]$/.exec(selector);
      const found = this.children.find((child) =>
        attribute ? attribute[1] in child.attrs : child.tag === selector
      );
      return found || null;
    },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function load() {
  const nodes = new Map();
  const byId = (id) => {
    if (!nodes.has(id)) nodes.set(id, node("div"));
    return nodes.get(id);
  };

  byId("count").value = "4";
  byId("prompt").value = "a cat";
  byId("size").value = "1024x1024";

  const select = byId("prompt-select");
  const optionFor = (id) => ({
    value: "a cat",
    getAttribute: (name) => (name === "data-id" ? id : null),
  });
  select.options = [optionFor("1"), optionFor("2")];
  select.selectedIndex = 0;

  const asked = [];
  const sandbox = {
    document: {
      getElementById: byId,
      createElement: (tag) => node(tag),
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener() {},
    },
    window: {
      ImageForgeApi: {
        GENERIC_ERR: "Something went wrong.",
        post(url, body) {
          const wait = deferred();
          asked.push({ url, body, answer: wait.resolve });
          return wait.promise;
        },
      },
      ImageForgeUi: {
        show(el, on) {
          if (el) el.hidden = !on;
        },
        setStatus(el, msg) {
          if (el) el.textContent = msg || "";
        },
      },
    },
    console,
  };
  sandbox.window.document = sandbox.document;
  vm.runInNewContext(fs.readFileSync(BATCH_FILE, "utf8"), sandbox);
  vm.runInNewContext(fs.readFileSync(FILE, "utf8"), sandbox);

  return {
    asked,
    select,
    tiles: byId("tiles"),
    saveBtn: byId("save-btn"),
    generateBtn: byId("generate-btn"),
    againBtn: byId("again-btn"),
    test: sandbox.window.ImageForgeGenerateTest,
  };
}

function batchOf(count) {
  return {
    images: Array.from({ length: count }, (_unused, index) => ({
      token: "t" + (index + 1),
      url: "/preview/" + (index + 1) + ".png",
      model: "gpt-image-1.5",
    })),
  };
}

const tick = () => new Promise((done) => setImmediate(done));

async function generated(page, count) {
  const run = page.test.runGenerate();
  page.asked[page.asked.length - 1].answer(batchOf(count));
  await run;
}

test("a tile clicked while saving does not arm Save again", async () => {
  const page = load();
  await generated(page, 4);
  page.tiles.children[0].click();

  const saving = page.test.runSave();
  assert.equal(page.saveBtn.disabled, true);

  page.tiles.children[1].click();
  assert.equal(page.saveBtn.disabled, true, "Save stays off during the save");
  assert.equal(page.tiles.children[1].getAttribute("aria-checked"), "false");

  page.asked[1].answer({ url: "/i/1.png" });
  await saving;
});

test("a second Save during a save sends nothing more", async () => {
  const page = load();
  await generated(page, 4);
  page.tiles.children[0].click();

  const saving = page.test.runSave();
  page.test.runSave();
  assert.equal(page.asked.length, 2, "one generate and one save");

  page.asked[1].answer({ url: "/i/1.png" });
  await saving;
});

test("Generate and Again are off until the save loop ends", async () => {
  const page = load();
  await generated(page, 4);
  page.tiles.children[0].click();

  const saving = page.test.runSave();
  assert.equal(page.generateBtn.disabled, true);
  assert.equal(page.againBtn.disabled, true);

  page.test.runGenerate();
  assert.equal(page.asked.length, 2, "no generate is sent mid-save");

  page.asked[1].answer({ url: "/i/1.png" });
  await saving;
  assert.equal(page.generateBtn.disabled, false);
  assert.equal(page.againBtn.disabled, false);
});

test("the batch keeps the prompt picked when it was asked for", async () => {
  const page = load();
  const run = page.test.runGenerate();

  page.select.selectedIndex = 1;
  (page.select.listeners.change || []).forEach((fn) => fn());

  page.asked[0].answer(batchOf(4));
  await run;
  await tick();

  page.tiles.children[0].click();
  const saving = page.test.runSave();
  assert.equal(page.asked[1].body.prompt_id, "1");
  page.asked[1].answer({ url: "/i/1.png" });
  await saving;
});
