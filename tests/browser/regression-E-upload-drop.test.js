/**
 * Drop zone: submitting with no file says why
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const JS = path.join(__dirname, "..", "..", "public", "js");

function element(extra = {}) {
  return Object.assign(
    {
      hidden: false,
      textContent: "",
      listeners: {},
      classList: { toggle() {} },
      addEventListener(name, fn) {
        this.listeners[name] = fn;
      },
      getAttribute: () => null,
      focus() {
        this.focused = true;
      },
    },
    extra
  );
}

function load() {
  const form = element();
  const input = element({ accept: "image/png", required: true, files: [], form });
  const plain = element();
  const zone = element({ hidden: true });
  const errorOut = element({ hidden: true });
  const parts = {
    'input[type="file"]': input,
    "[data-drop-plain]": plain,
    "[data-drop-zone]": zone,
    "[data-drop-error]": errorOut,
  };
  const field = element({ querySelector: (sel) => parts[sel] || null });

  const sandbox = {
    document: {
      querySelector: (sel) => (sel === "[data-drop-field]" ? field : null),
      querySelectorAll: () => [],
    },
    window: {
      ImageForgeUi: {
        show(el, on) {
          el.hidden = !on;
        },
        readableBytes: (n) => n + " B",
      },
    },
    DataTransfer: function DataTransfer() {
      this.items = { add() {} };
      this.files = [];
    },
    URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
    console,
  };
  sandbox.window.document = sandbox.document;
  vm.runInNewContext(
    fs.readFileSync(path.join(JS, "upload-sort.js"), "utf8"),
    sandbox
  );
  vm.runInNewContext(
    fs.readFileSync(path.join(JS, "upload-drop.js"), "utf8"),
    sandbox
  );
  return { form, input, plain, zone, errorOut };
}

test("once the zone takes over, the hidden input no longer blocks silently", () => {
  const page = load();

  assert.equal(page.plain.hidden, true, "the plain input is hidden");
  assert.equal(page.input.required, false, "so it is not left required");

  let stopped = false;
  page.form.listeners.submit({
    preventDefault() {
      stopped = true;
    },
  });

  assert.equal(stopped, true, "an empty form is still not sent");
  assert.equal(page.errorOut.hidden, false);
  assert.match(page.errorOut.textContent, /choose at least one image/i);
});

test("a form with a file goes through", () => {
  const page = load();
  page.input.files = [{ name: "a.png", type: "image/png", size: 1 }];

  let stopped = false;
  page.form.listeners.submit({
    preventDefault() {
      stopped = true;
    },
  });
  assert.equal(stopped, false);
});
