/**
 * Flags read the same way by the limiter, the controller and the list filter
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");

const openai = require("../../../services/openai");

let calls = 0;
openai.generateImage = async ({ n }) => {
  calls += 1;
  return {
    model: "gpt-image-2",
    usage: null,
    images: Array.from({ length: n || 1 }, () => ({
      bytes: Buffer.from("PNG"),
      dataUrl: "data:image/png;base64,UE5H",
    })),
  };
};

const { costOfGenerate, COMPARE_IMAGES } = require("../../../routes/apiCost");
const buildGenerate = require("../../../controllers/generateController");
const {
  readCriteria,
} = require("../../../controllers/support/helpers/generationCriteria");
const { quietLog } = require("../../helpers/quietLog");

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

function controller() {
  let held = 0;
  return buildGenerate({
    models: { Prompt: {}, Generation: {}, Spend: { recordGenerated() {} } },
    openaiCredentials: { apiKey: () => "k", model: () => "2" },
    pending: { put: () => `t${(held += 1)}` },
    log: quietLog(),
  });
}

const OFF = [false, 0, "0", "false", "off", "no", ""];

test("an off compare flag is charged as one image", () => {
  for (const compare of OFF) {
    assert.equal(costOfGenerate({ body: { compare } }), 1, String(compare));
  }
  assert.equal(costOfGenerate({ body: { compare: true } }), COMPARE_IMAGES);
  assert.equal(costOfGenerate({ body: { compare: "1" } }), COMPARE_IMAGES);
});

test("an off compare flag runs one generation, as it was charged", async () => {
  const ctrl = controller();
  for (const compare of OFF) {
    calls = 0;
    const res = fakeRes();
    await ctrl.generate(
      {
        body: { prompt: "a cat", compare },
        settings: { default_size: "1024x1024" },
      },
      res,
      () => {}
    );
    assert.equal(calls, 1, `compare=${JSON.stringify(compare)} asked once`);
    assert.equal(res.body.failed, undefined, "not a compare reply");
  }
});

test("the limiter and the controller agree on every flag", async () => {
  const ctrl = controller();
  for (const compare of [...OFF, true, 1, "1", "true", "on"]) {
    calls = 0;
    await ctrl.generate(
      {
        body: { prompt: "a cat", compare },
        settings: { default_size: "1024x1024" },
      },
      fakeRes(),
      () => {}
    );
    const charged = costOfGenerate({ body: { compare } });
    assert.equal(
      charged === COMPARE_IMAGES,
      calls > 1,
      `compare=${JSON.stringify(compare)}`
    );
  }
});

test("?fav=0 does not mean favourites only", () => {
  assert.equal(readCriteria({ query: { fav: "0" } }).favorite, false);
  assert.equal(readCriteria({ query: { fav: "false" } }).favorite, false);
  assert.equal(readCriteria({ query: {} }).favorite, false);
  assert.equal(readCriteria({ query: { fav: "1" } }).favorite, true);
});
