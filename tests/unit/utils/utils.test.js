/**
 * Utils tests
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const fs = require("fs");
const os = require("os");
const path = require("path");
const { field } = require("../../../utils/http/request");
const { parseId } = require("../../../utils/domain/coerce");
const { maskKey } = require("../../../utils/domain/mask");
const { safeEqual } = require("../../../utils/security/secureCompare");
const { generatedImageName } = require("../../../utils/domain/filename");
const { uploadsDirBytes } = require("../../../utils/files/uploads");
const { resolveModel } = require("../../../services/openai");

test("field reads and trims body values", () => {
  const body = { a: "  hi  ", b: 42, c: null };
  assert.equal(field(body, "a"), "hi");
  assert.equal(field(body, "a", { trim: false }), "  hi  ");
  assert.equal(field(body, "b"), "42");
  assert.equal(field(body, "c"), "");
  assert.equal(field(body, "missing"), "");
});

test("parseId accepts positive integers only", () => {
  assert.equal(parseId("7"), 7);
  assert.equal(parseId(7), 7);
  assert.equal(parseId("0"), null);
  assert.equal(parseId("-3"), null);
  assert.equal(parseId("abc"), null);
  assert.equal(parseId(undefined), null);
});

test("maskKey masks all but the ends", () => {
  assert.equal(maskKey("sk-abcdefgh"), "sk-…efgh");
  assert.equal(maskKey(""), "");
  assert.equal(maskKey("   "), "");
});

test("safeEqual is true only for identical strings", () => {
  assert.equal(safeEqual("secret", "secret"), true);
  assert.equal(safeEqual("secret", "Secret"), false);
  assert.equal(safeEqual("a", "aa"), false);
});

test("generatedImageName matches the expected pattern", () => {
  const name = generatedImageName();
  assert.match(name, /^image-forge-\d{14}-[0-9a-f]{6}\.png$/);
});

test("resolveModel maps tokens to OpenAI names", () => {
  assert.equal(resolveModel("1.5"), "gpt-image-1.5");
  assert.equal(resolveModel("2"), "gpt-image-2");
  assert.equal(resolveModel("bogus"), "gpt-image-1.5");
});

test("uploadsDirBytes sums file sizes and treats a missing folder as zero", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uploads-"));
  try {
    assert.equal(await uploadsDirBytes(dir), 0); 

    fs.writeFileSync(path.join(dir, "a.png"), Buffer.alloc(100));
    fs.writeFileSync(path.join(dir, "b.png"), Buffer.alloc(50));
    fs.mkdirSync(path.join(dir, "sub")); 
    assert.equal(await uploadsDirBytes(dir), 150);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  assert.equal(await uploadsDirBytes(path.join(dir, "gone")), 0); 
});

const { idList } = require("../../../utils/http/request");

test("idList reads one ticked box, which arrives as a bare string", () => {
  assert.deepEqual(idList({ ids: "12" }, "ids"), [12]);
});

test("idList reads several", () => {
  assert.deepEqual(idList({ ids: ["1", "2", "3"] }, "ids"), [1, 2, 3]);
});

test("idList is empty when nothing was ticked", () => {
  assert.deepEqual(idList({}, "ids"), []);
  assert.deepEqual(idList({ ids: [] }, "ids"), []);
  assert.deepEqual(idList(null, "ids"), []);
  assert.deepEqual(idList(undefined, "ids"), []);
});

test("idList drops anything that is not a positive whole number", () => {
  assert.deepEqual(
    idList({ ids: ["1", "0", "-3", "2.5", "abc", "", null, "4"] }, "ids"),
    [1, 4]
  );
});

test("idList de-duplicates, keeping the first appearance", () => {
  assert.deepEqual(idList({ ids: ["3", "1", "3", "1"] }, "ids"), [3, 1]);
});

test("idList caps how much work a hand-written post can ask for", () => {
  const many = Array.from({ length: 500 }, (_, i) => String(i + 1));
  assert.equal(idList({ ids: many }, "ids").length, 200);
  assert.equal(idList({ ids: many }, "ids", 5).length, 5);
});
