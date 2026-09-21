/**
 * PNG header tests
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const { pngSize } = require("../../../../utils/files/png");

function header(width, height) {
  const buf = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

test("the dimensions come out of the header", () => {
  assert.deepEqual(pngSize(header(1024, 1536)), { width: 1024, height: 1536 });
});

test("anything that is not a PNG is null", () => {
  assert.equal(pngSize(Buffer.from([0xff, 0xd8, 0xff, 0x00])), null, "a JPEG");
  assert.equal(pngSize(Buffer.from("not an image at all")), null);
  assert.equal(pngSize(Buffer.alloc(0)), null);
  assert.equal(pngSize(null), null);
});

test("a PNG cut off before its dimensions is null, not a guess", () => {
  assert.equal(pngSize(header(1024, 1024).subarray(0, 20)), null);
});

test("a zero dimension is refused", () => {
  assert.equal(pngSize(header(0, 1024)), null);
});
