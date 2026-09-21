/**
 * Rate limiter tests
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");

const { rateLimit } = require("../../../middleware/rateLimit");

function run(limiter, { ip = "1.1.1.1", body = {} } = {}) {
  const req = { ip, body, url: "/api/generate", originalUrl: "/api/generate" };
  let passed = false;
  const res = {
    setHeader() {},
    status() {
      return this;
    },
    json() {
      return this;
    },
  };

  limiter(req, res, () => {
    passed = true;
  });

  return passed;
}

test("a request costs one of the budget by default", () => {
  const limiter = rateLimit({ windowMs: 60000, max: 2 });

  assert.equal(run(limiter), true);
  assert.equal(run(limiter), true);
  assert.equal(run(limiter), false, "the third is over the limit");
});

test("a request may spend more than one of the budget", () => {
  const limiter = rateLimit({
    windowMs: 60000,
    max: 4,
    cost: (req) => Number(req.body.count) || 1,
  });

  assert.equal(run(limiter, { body: { count: 4 } }), true, "four of four");
  assert.equal(run(limiter, { body: { count: 1 } }), false, "the budget is spent");
});

test("a batch of two leaves room for two more images, not two more requests", () => {
  const limiter = rateLimit({
    windowMs: 60000,
    max: 4,
    cost: (req) => Number(req.body.count) || 1,
  });

  assert.equal(run(limiter, { body: { count: 2 } }), true);
  assert.equal(run(limiter, { body: { count: 2 } }), true);
  assert.equal(run(limiter, { body: { count: 1 } }), false);
});

test("a nonsense cost still spends one rather than nothing", () => {
  const limiter = rateLimit({
    windowMs: 60000,
    max: 2,
    cost: () => 0,
  });

  assert.equal(run(limiter), true);
  assert.equal(run(limiter), true);
  assert.equal(run(limiter), false, "a cost of zero cannot buy unlimited calls");
});

test("budgets are kept per client", () => {
  const limiter = rateLimit({
    windowMs: 60000,
    max: 4,
    cost: (req) => Number(req.body.count) || 1,
  });

  assert.equal(run(limiter, { ip: "1.1.1.1", body: { count: 4 } }), true);
  assert.equal(
    run(limiter, { ip: "2.2.2.2", body: { count: 4 } }),
    true,
    "another client has its own budget"
  );
  assert.equal(run(limiter, { ip: "1.1.1.1", body: { count: 1 } }), false);
});

test("a compare costs one image per model, because that is what it calls", () => {
  const { costOfGenerate } = require("../../../routes/apiCost");
  const { MODEL_TOKENS } = require("../../../config/images");

  assert.equal(costOfGenerate({ body: { count: "1" } }), 1, "one image, one");
  assert.equal(costOfGenerate({ body: { count: "4" } }), 4, "four images, four");
  assert.equal(
    costOfGenerate({ body: { compare: "1", count: "4" } }),
    MODEL_TOKENS.length,
    "a compare is one picture per model whatever the picker says"
  );
});
