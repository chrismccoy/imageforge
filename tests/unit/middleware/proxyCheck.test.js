/**
 * Proxy check middleware tests
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { env } = require("../../../config/env");
const { proxyCheck } = require("../../../middleware/proxyCheck");

function run({ trustProxy, headers }) {
  const original = env.TRUST_PROXY;
  env.TRUST_PROXY = trustProxy;
  try {
    const warnings = [];
    const mw = proxyCheck((msg) => warnings.push(msg));
    let nexted = false;
    mw({ headers }, {}, () => {
      nexted = true;
    });
    return { warnings, nexted };
  } finally {
    env.TRUST_PROXY = original;
  }
}

test("warns when TRUST_PROXY is on but no forwarded header is seen", () => {
  const { warnings, nexted } = run({ trustProxy: true, headers: {} });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /spoof/);
  assert.ok(nexted);
});

test("warns when a forwarded header is seen but TRUST_PROXY is off", () => {
  const { warnings } = run({
    trustProxy: false,
    headers: { "x-forwarded-for": "1.2.3.4" },
  });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /over-block/);
});

test("stays quiet when the setting matches the headers", () => {
  const on = run({ trustProxy: true, headers: { "x-forwarded-for": "1.2.3.4" } });
  const off = run({ trustProxy: false, headers: {} });
  assert.equal(on.warnings.length, 0);
  assert.equal(off.warnings.length, 0);
});

test("checks only the first request", () => {
  const original = env.TRUST_PROXY;
  env.TRUST_PROXY = true;
  try {
    const warnings = [];
    const mw = proxyCheck((msg) => warnings.push(msg));
    mw({ headers: {} }, {}, () => {});
    mw({ headers: {} }, {}, () => {});
    mw({ headers: {} }, {}, () => {});
    assert.equal(warnings.length, 1); 
  } finally {
    env.TRUST_PROXY = original;
  }
});
