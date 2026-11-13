/**
 * Edit page: what counts as a mask, which buttons paint, flattening
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const JS = path.join(__dirname, "..", "..", "public", "js");
const read = (name) => fs.readFileSync(path.join(JS, name), "utf8");

/** A 2d context that records every call; getImageData answers `pixels`. */
function context(calls, pixels) {
  return new Proxy(
    {},
    {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (prop === "getImageData") {
          return (x, y, w, h) => ({ data: pixels(w, h) });
        }
        return (...args) => calls.push([prop, ...args]);
      },
    }
  );
}

function element(extra = {}) {
  return Object.assign(
    {
      hidden: false,
      disabled: false,
      value: "",
      textContent: "",
      style: {},
      attrs: {},
      listeners: {},
      addEventListener(name, fn) {
        this.listeners[name] = fn;
      },
      getAttribute(name) {
        return name in this.attrs ? this.attrs[name] : null;
      },
      setAttribute(name, value) {
        this.attrs[name] = String(value);
      },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
      setPointerCapture() {},
      querySelectorAll: () => [],
    },
    extra
  );
}

function load({ layerAlpha = 0, source = { w: 100, h: 100 } } = {}) {
  const calls = { mask: [], layers: [], flat: [] };
  const posted = [];
  const pixels = (w, h) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let at = 3; at < data.length; at += 4) data[at] = layerAlpha;
    return data;
  };

  const parts = {};
  const byId = (id) => parts[id] || (parts[id] = element());
  parts.source = element({
    complete: true,
    naturalWidth: source.w,
    naturalHeight: source.h,
  });
  parts.mask = element({
    width: 0,
    height: 0,
    getContext: () => context(calls.mask, pixels),
    toBlob: (done) => done({ blob: "mask" }),
  });
  parts.brush = element({ value: "10", defaultValue: "10" });
  parts.prompt = element({ value: "a boat" });
  parts.size = element({ value: "1024x1024" });
  parts.edited = element({ naturalWidth: 0, naturalHeight: 0 });

  const toolRow = element({
    querySelectorAll: () => [],
  });

  let made = 0;
  const sandbox = {
    document: {
      getElementById: byId,
      querySelector: (sel) => (sel === "[data-tools]" ? toolRow : null),
      createElement: () => {
        made += 1;
        const own = [];
        const canvas = {
          width: 0,
          height: 0,
          calls: own,
          getContext: () => context(own, pixels),
          toBlob: (done) => done({ blob: "canvas" }),
        };
        calls.layers.push(canvas);
        return canvas;
      },
    },
    window: {
      ImageForgeApi: {
        GENERIC_ERR: "Something went wrong.",
        csrfToken: "t",
        async post(url, body) {
          posted.push({ url, body });
          if (url === "/api/edit") return { token: "tok", url: "/preview/x.png" };
          return {};
        },
        notice() {},
      },
      ImageForgeUi: {
        setStatus(el, msg) {
          el.textContent = msg || "";
        },
        show(el, on) {
          el.hidden = !on;
        },
      },
    },
    FormData: class {
      constructor() {
        this.parts = [];
      }
      append(...args) {
        this.parts.push(args);
      }
    },
    console,
  };
  sandbox.window.document = sandbox.document;
  vm.runInNewContext(read("edit-geometry.js"), sandbox);
  vm.runInNewContext(read("edit-strokes.js"), sandbox);
  vm.runInNewContext(read("edit.js"), sandbox);

  const mask = parts.mask;
  const at = (x, y, button = 0) => ({
    button,
    pointerType: "mouse",
    pointerId: 1,
    clientX: x,
    clientY: y,
  });

  return {
    parts,
    posted,
    calls,
    made: () => made,
    pick(tool) {
      toolRow.listeners.click({
        target: {
          closest: () => ({ getAttribute: () => tool }),
        },
      });
    },
    drag(from, to, button = 0) {
      mask.listeners.pointerdown(at(from[0], from[1], button));
      if (to) mask.listeners.pointermove(at(to[0], to[1], button));
      mask.listeners.pointerup(at(0, 0, button));
    },
    edit: () => parts["edit-btn"].listeners.click(),
    status: () => parts.status.textContent,
  };
}

const NO_MASK = "Brush over the part to change.";

test("eraser strokes alone are not a mask", async () => {
  const page = load();
  page.pick("eraser");
  page.drag([10, 10], [50, 50]);

  await page.edit();
  assert.equal(page.status(), NO_MASK);
  assert.equal(page.posted.length, 0, "no paid call is made");
});

test("a box with no area is not a mask", async () => {
  const page = load();
  page.pick("rect");
  page.drag([10, 10], [10, 60]);

  await page.edit();
  assert.equal(page.status(), NO_MASK);
  assert.equal(page.posted.length, 0);
});

test("paint the eraser has taken all back is not a mask", async () => {
  const page = load({ layerAlpha: 0 });
  page.drag([10, 10], [50, 50]);
  page.pick("eraser");
  page.drag([10, 10], [50, 50]);

  await page.edit();
  assert.equal(page.status(), NO_MASK);
  assert.equal(page.posted.length, 0);
});

test("paint left over after erasing is a mask", async () => {
  const page = load({ layerAlpha: 255 });
  page.drag([10, 10], [50, 50]);
  page.pick("eraser");
  page.drag([10, 10], [20, 20]);

  await page.edit();
  assert.equal(page.posted[0].url, "/api/edit");
});

test("a plain brush stroke is a mask", async () => {
  const page = load();
  page.drag([10, 10], [50, 50]);

  await page.edit();
  assert.equal(page.posted[0].url, "/api/edit");
});

test("a right or middle click does not paint", async () => {
  for (const button of [1, 2]) {
    const page = load();
    page.drag([10, 10], [50, 50], button);

    await page.edit();
    assert.equal(page.status(), NO_MASK, `button ${button}`);
    assert.equal(page.posted.length, 0);
  }
});

async function savedSeeThrough(source) {
  const page = load({ layerAlpha: 0, source });
  page.drag([10, 10], [50, 50]);
  await page.edit();

  page.parts.edited.naturalWidth = 100;
  page.parts.edited.naturalHeight = 100;
  const before = page.calls.layers.length;
  await page.parts["save-btn"].listeners.click();

  const flat = page.calls.layers[before];
  return { page, flat };
}

test("flattening clears the canvas before drawing the original under the edit", async () => {
  const { page, flat } = await savedSeeThrough({ w: 200, h: 200 });

  const names = flat.calls.map((call) => call[0]);
  const clear = names.indexOf("clearRect");
  const firstDrawAfterProbe = names.indexOf("drawImage", 1);
  assert.ok(clear !== -1, "the canvas is cleared");
  assert.ok(clear < firstDrawAfterProbe, "before the original goes down");
  assert.ok(page.posted.some((item) => item.url === "/api/flatten"));
});

test("an original of another shape is not stretched under the edit", async () => {
  const { page, flat } = await savedSeeThrough({ w: 300, h: 100 });

  const draws = flat.calls.filter((call) => call[0] === "drawImage");
  assert.equal(draws.length, 1, "only the probe draw of the edit itself");
  assert.ok(
    !page.posted.some((item) => item.url === "/api/flatten"),
    "nothing is flattened"
  );
  assert.ok(
    page.posted.some((item) => item.url === "/api/save"),
    "it still saves"
  );
});
