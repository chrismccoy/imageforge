/**
 * Template field tests
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const DIR = path.join(__dirname, "..", "..", "public", "js");

function fakeEl(extra = {}) {
  return Object.assign(
    {
      value: "",
      hidden: false,
      className: "",
      textContent: "",
      listeners: {},
      dispatched: [],
      children: [],
      addEventListener(name, fn) {
        (this.listeners[name] = this.listeners[name] || []).push(fn);
      },
      dispatchEvent(event) {
        this.dispatched.push(event.type);
        (this.listeners[event.type] || []).forEach((fn) => fn(event));
        return true;
      },
      appendChild(child) {
        this.children.push(child);
        return child;
      },
    },
    extra
  );
}

function load(templateText) {
  const select = fakeEl({ value: templateText });
  const block = fakeEl();
  const promptField = fakeEl();

  const byId = {
    "prompt-select": select,
    variables: block,
    prompt: promptField,
  };

  const sandbox = {
    document: {
      getElementById: (id) => byId[id] || null,
      createElement: () => fakeEl(),
      querySelectorAll: () => [],
      addEventListener() {},
    },
    window: {},
    console,
  };
  sandbox.Event = function (type) {
    this.type = type;
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(DIR, "template.js"), "utf8") +
      "\n" +
      fs.readFileSync(path.join(DIR, "template-fields.js"), "utf8"),
    sandbox
  );

  return { select, block, promptField };
}

function choose(select) {
  select.listeners.change.forEach((fn) => fn());
}

test("choosing a prompt puts its text in the box", () => {
  const { select, promptField } = load("a mark of {thing}");
  choose(select);
  assert.equal(promptField.value, "a mark of {thing}");
});

test("choosing a prompt says the box changed, so a counter can follow", () => {
  const { select, promptField } = load("a mark of {thing}");
  choose(select);
  assert.deepEqual(promptField.dispatched, ["input"]);
});

test("filling a variable says the box changed too", () => {
  const { select, block, promptField } = load("a mark of {thing}");
  choose(select);
  promptField.dispatched.length = 0;

  const label = block.children[block.children.length - 1];
  const input = label.children[0];
  input.value = "a fox";
  input.listeners.input.forEach((fn) => fn());

  assert.equal(promptField.value, "a mark of a fox");
  assert.deepEqual(promptField.dispatched, ["input"]);
});
