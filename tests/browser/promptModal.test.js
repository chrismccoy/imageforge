/**
 * prompt-modal.js against a page
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const FILE = path.join(__dirname, "..", "..", "public", "js", "prompt-modal.js");

function el(attrs = {}) {
  return {
    attrs,
    hidden: false,
    disabled: false,
    value: "",
    textContent: "",
    handlers: {},
    getAttribute(name) {
      return name in this.attrs ? this.attrs[name] : null;
    },
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    addEventListener(event, handler) {
      this.handlers[event] = handler;
    },
    fire(event, arg) {
      return this.handlers[event] ? this.handlers[event](arg) : undefined;
    },
  };
}

function aCard({ prompt = "a lighthouse", save = "/generations/7/prompt" } = {}) {
  const button = el({ "data-prompt": prompt, "data-prompt-save": save });
  const line = el();
  line.textContent = prompt;
  const image = el({ alt: prompt });

  const card = {
    querySelector(selector) {
      if (selector === "[data-row-prompt]") return line;
      if (selector === "img") return image;
      return null;
    },
  };
  button.closest = (selector) =>
    selector === "[data-generation-card]" ? card : null;

  return { button, line, image };
}

function load(card, post) {
  const modal = el();
  const parts = {
    "prompt-modal": modal,
    "prompt-modal-text": el(),
    "prompt-modal-edit": el(),
    "prompt-modal-copy": el(),
    "prompt-modal-edit-start": el(),
    "prompt-modal-save": el(),
    "prompt-modal-cancel": el(),
  };
  const closer = el();
  const notices = [];
  const posted = [];

  const sandbox = {
    document: {
      getElementById: (id) => parts[id] || null,
      querySelectorAll: (selector) => {
        if (selector === "[data-prompt-show]") return [card.button];
        if (selector === "[data-prompt-close]") return [closer];
        return [];
      },
      addEventListener() {},
    },
    navigator: {},
    window: {
      ImageForgeUi: {
        show(element, on) {
          element.hidden = !on;
        },
        resetLabel() {},
        flashLabel() {},
      },
      ImageForgeApi: {
        async post(url, body) {
          posted.push({ url, body });
          return post(url, body);
        },
        notice(message) {
          notices.push(message);
        },
      },
    },
    console,
  };

  vm.runInNewContext(fs.readFileSync(FILE, "utf8"), sandbox);
  return { parts, closer, notices, posted };
}

const OK = async (url, body) => ({ prompt: String(body.prompt).trim() });

test("opening a card's prompt offers an edit and hides the box", () => {
  const card = aCard();
  const { parts } = load(card, OK);

  card.button.fire("click");

  assert.equal(parts["prompt-modal"].hidden, false);
  assert.equal(parts["prompt-modal-text"].textContent, "a lighthouse");
  assert.equal(parts["prompt-modal-edit"].hidden, true);
  assert.equal(parts["prompt-modal-edit-start"].hidden, false);
  assert.equal(parts["prompt-modal-save"].hidden, true);
  assert.equal(parts["prompt-modal-cancel"].hidden, true);
});

test("a prompt opened with nowhere to save cannot be edited", () => {
  const card = aCard({ save: null });
  const { parts } = load(card, OK);

  card.button.fire("click");

  assert.equal(parts["prompt-modal-edit-start"].hidden, true);
});

test("an empty prompt reads as wording but is edited as nothing", () => {
  const card = aCard({ prompt: "" });
  const { parts } = load(card, OK);

  card.button.fire("click");
  assert.equal(parts["prompt-modal-text"].textContent, "(no prompt)");

  parts["prompt-modal-edit-start"].fire("click");
  assert.equal(parts["prompt-modal-edit"].value, "");
});

test("starting an edit swaps the text for the box and the buttons for it", () => {
  const card = aCard();
  const { parts } = load(card, OK);

  card.button.fire("click");
  parts["prompt-modal-edit-start"].fire("click");

  assert.equal(parts["prompt-modal-edit"].value, "a lighthouse");
  assert.equal(parts["prompt-modal-edit"].hidden, false);
  assert.equal(parts["prompt-modal-text"].hidden, true);
  assert.equal(parts["prompt-modal-save"].hidden, false);
  assert.equal(parts["prompt-modal-cancel"].hidden, false);
  assert.equal(parts["prompt-modal-edit-start"].hidden, true);
});

test("saving posts the new text and repaints the card with what was stored", async () => {
  const card = aCard();
  const { parts, posted } = load(card, OK);

  card.button.fire("click");
  parts["prompt-modal-edit-start"].fire("click");
  parts["prompt-modal-edit"].value = "  a harbour at dusk  ";
  await parts["prompt-modal-save"].fire("click");

  assert.equal(posted.length, 1);
  assert.equal(posted[0].url, "/generations/7/prompt");
  assert.equal(posted[0].body.prompt, "  a harbour at dusk  ");
  assert.equal(card.button.getAttribute("data-prompt"), "a harbour at dusk");
  assert.equal(card.line.textContent, "a harbour at dusk");
  assert.equal(card.image.getAttribute("alt"), "a harbour at dusk");
  assert.equal(parts["prompt-modal-text"].textContent, "a harbour at dusk");
  assert.equal(parts["prompt-modal-edit"].hidden, true);
});

test("saving an empty prompt leaves the wording behind, not a blank line", async () => {
  const card = aCard();
  const { parts } = load(card, OK);

  card.button.fire("click");
  parts["prompt-modal-edit-start"].fire("click");
  parts["prompt-modal-edit"].value = "";
  await parts["prompt-modal-save"].fire("click");

  assert.equal(card.button.getAttribute("data-prompt"), "");
  assert.equal(card.line.textContent, "(no prompt)");
  assert.equal(parts["prompt-modal-text"].textContent, "(no prompt)");
});

test("a refused save says so and changes nothing on the card", async () => {
  const card = aCard();
  const { parts, notices } = load(card, async () => {
    throw new Error("That image is not saved.");
  });

  card.button.fire("click");
  parts["prompt-modal-edit-start"].fire("click");
  parts["prompt-modal-edit"].value = "a harbour at dusk";
  await parts["prompt-modal-save"].fire("click");

  assert.deepEqual(notices, ["That image is not saved."]);
  assert.equal(card.button.getAttribute("data-prompt"), "a lighthouse");
  assert.equal(card.line.textContent, "a lighthouse");
  assert.equal(parts["prompt-modal-save"].disabled, false, "can be tried again");
});

test("cancelling puts the text back and posts nothing", async () => {
  const card = aCard();
  const { parts, posted } = load(card, OK);

  card.button.fire("click");
  parts["prompt-modal-edit-start"].fire("click");
  parts["prompt-modal-edit"].value = "something else";
  parts["prompt-modal-cancel"].fire("click");

  assert.deepEqual(posted, []);
  assert.equal(parts["prompt-modal-text"].textContent, "a lighthouse");
  assert.equal(parts["prompt-modal-edit"].hidden, true);
  assert.equal(parts["prompt-modal-edit-start"].hidden, false);
});

test("closing mid-edit and opening again starts from the stored text", () => {
  const card = aCard();
  const { parts, closer } = load(card, OK);

  card.button.fire("click");
  parts["prompt-modal-edit-start"].fire("click");
  parts["prompt-modal-edit"].value = "half a thought";
  closer.fire("click");

  card.button.fire("click");
  assert.equal(parts["prompt-modal"].hidden, false);
  assert.equal(parts["prompt-modal-text"].textContent, "a lighthouse");
  assert.equal(parts["prompt-modal-edit"].hidden, true);
});
