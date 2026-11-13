/**
 * prompt-modal.js: a save still out when another card is opened
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

function load(cards, post) {
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
        if (selector === "[data-prompt-show]")
          return cards.map((card) => card.button);
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

test("a slow save lands on its own card, not the one open now", async () => {
  const a = aCard({ prompt: "a lighthouse", save: "/generations/1/prompt" });
  const b = aCard({ prompt: "a forest", save: "/generations/2/prompt" });
  let answer;
  const { parts, posted } = load(
    [a, b],
    () =>
      new Promise((done) => {
        answer = done;
      })
  );

  a.button.fire("click");
  parts["prompt-modal-edit-start"].fire("click");
  parts["prompt-modal-edit"].value = "a harbour";
  const saving = parts["prompt-modal-save"].fire("click");

  b.button.fire("click");
  answer({ prompt: "a harbour" });
  await saving;

  assert.equal(posted[0].url, "/generations/1/prompt");
  assert.equal(a.button.getAttribute("data-prompt"), "a harbour");
  assert.equal(a.line.textContent, "a harbour");
  assert.equal(b.button.getAttribute("data-prompt"), "a forest");
  assert.equal(b.line.textContent, "a forest");
  assert.equal(parts["prompt-modal-text"].textContent, "a forest");

  parts["prompt-modal-edit-start"].fire("click");
  assert.equal(parts["prompt-modal-edit"].value, "a forest", "B edits B's text");
});
