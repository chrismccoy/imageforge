/**
 * Crops keep their real image type, and only a real size is stored
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");

const buildCrop = require("../../../controllers/cropController");
const { createPendingImages } = require("../../../services/pendingImages");

const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(20),
]);
const WEBP = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.alloc(4),
  Buffer.from("WEBP"),
  Buffer.alloc(12),
]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(16),
]);

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

function setup() {
  const pending = createPendingImages();
  const source = {
    id: 1,
    prompt: "a sky",
    prompt_id: null,
    model: "gpt-image-2",
    size: "1024x1024",
  };
  const ctrl = buildCrop({
    models: { Generation: { get: (id) => (id === 1 ? source : null) } },
    pending,
  });
  const crop = (buffer, size) => {
    const res = fakeRes();
    ctrl.crop(
      { body: { source_id: "1", size }, files: { image: [{ buffer }] } },
      res
    );
    return res;
  };
  return { pending, crop };
}

test("a JPEG or WebP crop is shown under its own type", () => {
  const { pending, crop } = setup();
  try {
    assert.match(crop(JPEG, "800x600").body.url, /^data:image\/jpeg;base64,/);
    assert.match(crop(WEBP, "800x600").body.url, /^data:image\/webp;base64,/);
    assert.match(crop(PNG, "800x600").body.url, /^data:image\/png;base64,/);
  } finally {
    pending.close();
  }
});

test("a size that is not WIDTHxHEIGHT falls back to the source's", () => {
  const { pending, crop } = setup();
  try {
    for (const size of ["<b>big</b>", "800x600x2", "123456x1", "800 x 600", "x"]) {
      const res = crop(PNG, size);
      assert.equal(res.statusCode, 200);
      assert.equal(pending.peek(res.body.token).meta.size, "1024x1024", size);
    }

    const res = crop(PNG, "800x600");
    assert.equal(pending.peek(res.body.token).meta.size, "800x600");
  } finally {
    pending.close();
  }
});
