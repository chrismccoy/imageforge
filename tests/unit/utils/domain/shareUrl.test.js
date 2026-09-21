/**
 * Share URL tests
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildShareUrls } = require("../../../../utils/domain/shareUrl");

test("an unshared image has no URLs", () => {
  for (const row of [{ share_token: null, prompt: "x" }, { prompt: "x" }, null]) {
    const urls = buildShareUrls(row, true);
    assert.equal(urls.link, null);
    assert.equal(urls.image, null);
  }
});

test("without slugs the URLs are the token alone", () => {
  const urls = buildShareUrls(
    { share_token: "k3f9Qa72vX", prompt: "A blue sky" },
    false
  );
  assert.deepEqual(urls, {
    link: "/s/k3f9Qa72vX",
    image: "/i/k3f9Qa72vX",
  });
});

test("with slugs the prompt comes first", () => {
  const urls = buildShareUrls(
    { share_token: "k3f9Qa72vX", prompt: "A blue sky" },
    true
  );
  assert.deepEqual(urls, {
    link: "/s/a-blue-sky-k3f9Qa72vX",
    image: "/i/a-blue-sky-k3f9Qa72vX",
  });
});

test("a prompt that slugs to nothing falls back to the token", () => {
  const urls = buildShareUrls(
    { share_token: "k3f9Qa72vX", prompt: "東京の路地" },
    true
  );
  assert.deepEqual(urls, {
    link: "/s/k3f9Qa72vX",
    image: "/i/k3f9Qa72vX",
  });
});

test("a legacy hex token is left alone", () => {
  const token = "9f3a1c2b8e4d7a6f0c5b9e3d1a8f2c4b";
  assert.equal(
    buildShareUrls({ share_token: token, prompt: "" }, true).link,
    `/s/${token}`
  );
});

test("the image URL ends in the extension of the file behind it", () => {
  const urls = buildShareUrls(
    { share_token: "k3f9Qa72vX", prompt: "A blue sky", filename: "cat.png" },
    false
  );
  assert.deepEqual(urls, {
    link: "/s/k3f9Qa72vX",
    image: "/i/k3f9Qa72vX.png",
  });
});

test("with a slug the extension still comes last", () => {
  const urls = buildShareUrls(
    { share_token: "k3f9Qa72vX", prompt: "A blue sky", filename: "cat.jpg" },
    true
  );
  assert.deepEqual(urls, {
    link: "/s/a-blue-sky-k3f9Qa72vX",
    image: "/i/a-blue-sky-k3f9Qa72vX.jpg",
  });
});

test("an upload's own format is the one the URL names", () => {
  assert.equal(
    buildShareUrls(
      { share_token: "k3f9Qa72vX", prompt: "", filename: "holiday.webp" },
      false
    ).image,
    "/i/k3f9Qa72vX.webp"
  );
});

test("a file with no usable extension keeps the plain image URL", () => {
  assert.equal(
    buildShareUrls(
      { share_token: "k3f9Qa72vX", prompt: "", filename: "noextension" },
      false
    ).image,
    "/i/k3f9Qa72vX"
  );
});
