/**
 * The grid of generated images
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

function load(answers) {
  const nodes = new Map();
  const byId = (id) => {
    if (!nodes.has(id)) nodes.set(id, node("div"));
    return nodes.get(id);
  };

  byId("count").value = "4";
  byId("prompt").value = "a cat";
  byId("size").value = "1024x1024";
  byId("model").value = "gpt-image-1.5";

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
          asked.push({ url, body });
          const next = answers.shift();
          if (!next) return Promise.reject(new Error("nothing left to answer"));
          return Promise.resolve(next);
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
    byId,
    tiles: byId("tiles"),
    saveBtn: byId("save-btn"),
    generateBtn: byId("generate-btn"),
    test: sandbox.window.ImageForgeGenerateTest,
  };
}

function batchOf(run, count) {
  return {
    images: Array.from({ length: count }, (_unused, index) => ({
      token: `${run}${index + 1}`,
      url: `/preview/${run}${index + 1}.png`,
      model: "gpt-image-1.5",
    })),
  };
}

function pictureIn(tile) {
  const img = tile.querySelector("img");
  return img ? img.src : null;
}

test("a tile from a second batch shows that batch's picture when clicked", async () => {
  const page = load([batchOf("a", 4), batchOf("b", 4)]);

  await page.test.runGenerate();
  await page.test.runGenerate();

  assert.equal(pictureIn(page.tiles.children[0]), "/preview/b1.png");

  page.tiles.children[0].click();

  assert.equal(
    pictureIn(page.tiles.children[0]),
    "/preview/b1.png",
    "clicking a tile must not put the previous batch's picture back"
  );
});

test("picking a tile from a second batch arms Save", async () => {
  const page = load([batchOf("a", 4), batchOf("b", 4)]);

  await page.test.runGenerate();
  await page.test.runGenerate();

  assert.equal(page.saveBtn.disabled, true, "nothing is picked to begin with");

  page.tiles.children[0].click();

  assert.equal(page.saveBtn.disabled, false);
  assert.equal(page.saveBtn.textContent, "Save");
});

test("saving a picked tile sends that batch's token", async () => {
  const page = load([batchOf("a", 4), batchOf("b", 4), { url: "/i/7.png" }]);

  await page.test.runGenerate();
  await page.test.runGenerate();
  page.tiles.children[1].click();
  await page.test.runSave();

  const save = page.asked[page.asked.length - 1];
  assert.equal(save.url, "/api/save");
  assert.equal(save.body.token, "b2");
});

test("a picked tile is drawn as picked", async () => {
  const page = load([batchOf("a", 4)]);
  await page.test.runGenerate();
  page.tiles.children[0].click();

  assert.match(page.tiles.children[0].className, /border-brand-600/);
  assert.doesNotMatch(page.tiles.children[1].className, /border-brand-600/);
});

test("saving repaints the tiles that are already there", async () => {
  const page = load([batchOf("a", 4), { url: "/i/7.png" }]);

  await page.test.runGenerate();
  const before = page.tiles.children.slice();
  page.tiles.children[0].click();
  await page.test.runSave();

  assert.equal(page.tiles.children.length, 4);
  page.tiles.children.forEach((tile, index) => {
    assert.equal(tile, before[index], "tile " + index + " was replaced");
  });
});
