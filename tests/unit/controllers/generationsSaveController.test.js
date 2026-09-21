/**
 * Generations save controller tests
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const buildController = require("../../../controllers/generationsSaveController");
const { createPendingImages } = require("../../../services/pendingImages");
const { createUploadsUsage } = require("../../../services/uploadsUsage");
const { uploadPath } = require("../../../utils/files/uploads");
const { UPLOAD_DIR } = require("../../../config/paths");

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
    redirect(to) {
      this.redirectedTo = to;
      return this;
    },
  };
}

function fakeGeneration(trashed = []) {
  const rows = [];
  return { rows, add: (row) => rows.push(row), trashed: () => trashed };
}

const credentials = {
  model: () => "1.5",
  apiKey: () => "k",
  apiKeyFromEnv: () => false,
};

test("save writes the held bytes and records the generation", async () => {
  const pending = createPendingImages();
  const Generation = fakeGeneration();
  const ctrl = buildController({
    models: { Generation, Prompt: {}, Settings: {} },
    openaiCredentials: credentials,
    pending,
    usage: createUploadsUsage(),
  });

  const token = pending.put(Buffer.from("PNGDATA"), {
    prompt: "a cat",
    size: "1024x1024",
    model: "gpt-image-1.5",
  });

  const res = fakeRes();
  await ctrl.save({ body: { token, prompt_id: "7" } }, res);

  assert.equal(res.statusCode, 200);
  assert.match(res.body.url, /^\/uploads\/image-forge-/);

  assert.equal(Generation.rows.length, 1);
  assert.equal(Generation.rows[0].prompt, "a cat");
  assert.equal(Generation.rows[0].model, "gpt-image-1.5");
  assert.equal(Generation.rows[0].prompt_id, 7);

  const filename = res.body.url.replace("/uploads/", "");
  const { full } = uploadPath(filename, UPLOAD_DIR);
  assert.ok(fs.existsSync(full));
  assert.equal(fs.readFileSync(full).toString(), "PNGDATA");
  fs.unlinkSync(full);

  pending.close();
});

test("save with a missing or spent token is rejected", async () => {
  const pending = createPendingImages();
  const ctrl = buildController({
    models: { Generation: fakeGeneration(), Prompt: {}, Settings: {} },
    openaiCredentials: credentials,
    pending,
    usage: createUploadsUsage(),
  });

  const res = fakeRes();
  await ctrl.save({ body: { token: "bogus" } }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /Nothing to save/);

  pending.close();
});

test("save refuses to write once the uploads quota would be exceeded", async () => {
  const pending = createPendingImages();
  const Generation = fakeGeneration();

  const ctrl = buildController({
    models: { Generation, Prompt: {}, Settings: {} },
    openaiCredentials: credentials,
    pending,
    usage: createUploadsUsage({ quotaBytes: 1 }),
  });

  const token = pending.put(Buffer.from("PNGDATA"), {
    prompt: "a cat",
    size: "1024x1024",
    model: "gpt-image-1.5",
  });

  const res = fakeRes();
  await ctrl.save({ body: { token } }, res);

  assert.equal(res.statusCode, 507);
  assert.match(res.body.message, /Storage is full/);
  assert.equal(Generation.rows.length, 0); 

  pending.close();
});

test("a refused save names the trash when it is holding room", async () => {
  const pending = createPendingImages();
  const Generation = fakeGeneration([{ id: 1 }, { id: 2 }]);

  const ctrl = buildController({
    models: { Generation, Prompt: {}, Settings: {} },
    openaiCredentials: credentials,
    pending,
    usage: createUploadsUsage({ quotaBytes: 1 }),
  });

  const token = pending.put(Buffer.from("PNGDATA"), {
    prompt: "a cat",
    size: "1024x1024",
    model: "gpt-image-1.5",
  });

  const res = fakeRes();
  await ctrl.save({ body: { token } }, res);

  assert.equal(res.statusCode, 507);
  assert.match(res.body.message, /trash/i);
  assert.match(res.body.message, /2 images/);

  pending.close();
});

test("a refused save with an empty trash does not mention it", async () => {
  const pending = createPendingImages();
  const Generation = fakeGeneration([]);

  const ctrl = buildController({
    models: { Generation, Prompt: {}, Settings: {} },
    openaiCredentials: credentials,
    pending,
    usage: createUploadsUsage({ quotaBytes: 1 }),
  });

  const token = pending.put(Buffer.from("PNGDATA"), {
    prompt: "a cat",
    size: "1024x1024",
    model: "gpt-image-1.5",
  });

  const res = fakeRes();
  await ctrl.save({ body: { token } }, res);

  assert.equal(res.statusCode, 507);
  assert.equal(/trash/i.test(res.body.message), false, "nothing to reclaim");

  pending.close();
});

test("a save refused by the quota leaves the image saveable", async () => {
  const pending = createPendingImages();
  const Generation = fakeGeneration();
  const ctrl = buildController({
    models: { Generation },
    pending,
    usage: createUploadsUsage({ quotaBytes: 0 }),
  });

  const token = pending.put(Buffer.from("PNGBYTES"), { prompt: "a cat" });

  const refused = fakeRes();
  await ctrl.save({ body: { token } }, refused);
  assert.equal(refused.statusCode, 507);
  assert.equal(Generation.rows.length, 0);

  assert.ok(pending.peek(token), "the held image should survive a refusal");

  pending.close();
});

test("two saves racing on one token record the image once", async () => {
  const pending = createPendingImages();
  const Generation = fakeGeneration();
  const ctrl = buildController({
    models: { Generation },
    pending,
    usage: createUploadsUsage(),
  });

  const token = pending.put(Buffer.from("PNGDATA"), {
    prompt: "a cat",
    size: "1024x1024",
    model: "gpt-image-1.5",
  });

  const first = fakeRes();
  const second = fakeRes();
  await Promise.all([
    ctrl.save({ body: { token } }, first),
    ctrl.save({ body: { token } }, second),
  ]);

  const written = [first, second]
    .filter((res) => res.body && res.body.url)
    .map(
      (res) => uploadPath(res.body.url.replace("/uploads/", ""), UPLOAD_DIR).full
    );
  written.forEach((full) => {
    try {
      fs.unlinkSync(full);
    } catch (_err) {
    }
  });

  assert.equal(Generation.rows.length, 1, "one row, not two");
  assert.equal(written.length, 1, "and one file on disk, not two");

  const refused = [first, second].find((res) => res.statusCode === 400);
  assert.ok(refused, "the loser is told there is nothing to save");
  assert.match(refused.body.message, /Nothing to save/);

  pending.close();
});
