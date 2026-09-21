/**
 * Security header tests
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createSecurityHeaders } = require("../../../middleware/securityHeaders");

function headers(settings) {
  const securityHeaders = createSecurityHeaders(settings ? { settings } : {});
  const set = {};
  const res = {
    setHeader(name, value) {
      set[name] = value;
    },
  };
  let called = false;
  securityHeaders({}, res, () => {
    called = true;
  });
  assert.ok(called, "the middleware must call next()");
  return set;
}

function directive(name) {
  return headers()
    ["Content-Security-Policy"].split("; ")
    .find((part) => part.startsWith(name + " "));
}

test("scripts and styles come only from this site", () => {
  assert.equal(directive("script-src"), "script-src 'self'");
  assert.equal(directive("style-src"), "style-src 'self'");
  assert.equal(directive("object-src"), "object-src 'none'");
  assert.equal(directive("frame-ancestors"), "frame-ancestors 'none'");
});

test("images may be blob URLs, which the upload preview needs", () => {
  const img = directive("img-src");

  assert.match(img, /blob:/, "the drag-and-drop preview thumbnail needs blob:");
  assert.match(img, /data:/, "the Generate page preview needs data:");
  assert.match(img, /'self'/);
});

test("the policy is not widened past what the pages use", () => {
  const img = directive("img-src");

  assert.equal(img, "img-src 'self' data: blob:");
});
