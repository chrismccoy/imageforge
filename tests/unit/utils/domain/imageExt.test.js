/**
 * Image extension tests
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  splitImageExt,
  extensionOf,
  extMatches,
} = require("../../../../utils/domain/imageExt");

test("a known extension is split off the segment", () => {
  assert.deepEqual(splitImageExt("Fdkk05Hpw7.png"), {
    name: "Fdkk05Hpw7",
    ext: "png",
  });
  assert.deepEqual(splitImageExt("Fdkk05Hpw7.webp"), {
    name: "Fdkk05Hpw7",
    ext: "webp",
  });
});

test("a segment with no extension keeps its whole name", () => {
  assert.deepEqual(splitImageExt("Fdkk05Hpw7"), {
    name: "Fdkk05Hpw7",
    ext: "",
  });
});

test("a slug in front of the token survives the split", () => {
  assert.deepEqual(splitImageExt("a-blue-sky-Fdkk05Hpw7.png"), {
    name: "a-blue-sky-Fdkk05Hpw7",
    ext: "png",
  });
});

test("an extension the app does not serve is left in the name", () => {
  assert.deepEqual(splitImageExt("Fdkk05Hpw7.exe"), {
    name: "Fdkk05Hpw7.exe",
    ext: "",
  });
});

test("an extension is read whatever case it arrives in", () => {
  assert.deepEqual(splitImageExt("Fdkk05Hpw7.PNG"), {
    name: "Fdkk05Hpw7",
    ext: "png",
  });
});

test("nothing at all splits into nothing", () => {
  assert.deepEqual(splitImageExt(""), { name: "", ext: "" });
  assert.deepEqual(splitImageExt(null), { name: "", ext: "" });
  assert.deepEqual(splitImageExt(undefined), { name: "", ext: "" });
});

test("a stored name gives up its extension", () => {
  assert.equal(extensionOf("image-forge-20260731021546-93c031.png"), "png");
  assert.equal(extensionOf("holiday.jpg"), "jpg");
  assert.equal(extensionOf("holiday.webp"), "webp");
});

test("a name with no servable extension gives up nothing", () => {
  assert.equal(extensionOf("noextension"), "");
  assert.equal(extensionOf("archive.zip"), "");
  assert.equal(extensionOf(""), "");
  assert.equal(extensionOf(null), "");
});

test("an extension must be the one the file actually is", () => {
  assert.equal(extMatches("cat.png", "png"), true);
  assert.equal(extMatches("cat.png", "jpg"), false);
  assert.equal(extMatches("cat.webp", "png"), false);
});

test("jpeg and jpg are the same picture", () => {
  assert.equal(extMatches("cat.jpg", "jpeg"), true);
  assert.equal(extMatches("cat.jpeg", "jpg"), true);
});

test("no extension claims nothing and so cannot be wrong", () => {
  assert.equal(extMatches("cat.png", ""), true);
  assert.equal(extMatches("noextension", ""), true);
});

test("a file with no extension answers only the plain URL", () => {
  assert.equal(extMatches("noextension", "png"), false);
});
