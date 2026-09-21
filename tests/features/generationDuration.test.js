/**
 * Generation duration feature tests
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";
process.env.OPENAI_API_KEY = "test-key";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const Database = require("better-sqlite3");

const openai = require("../../services/openai");
const { MODELS } = require("../../config/images");

const IMAGE_BYTES = Buffer.from("PNGBYTES");
const TIMES = {
  "gpt-image-1.5": 8421,
  "gpt-image-2": 65000,
  "gpt-image-2.5-sunburst": 21000,
  "gpt-image-2.5-flare": 4200,
};

openai.generateImage = async ({ model, n = 1 }) => {
  const id = MODELS[model] || "gpt-image-1.5";
  return {
    model: id,
    usage: { total: 1000 },
    durationMs: n > 1 ? 38200 : TIMES[id],
    images: Array.from({ length: n }, () => ({
      bytes: IMAGE_BYTES,
      dataUrl: `data:image/png;base64,${IMAGE_BYTES.toString("base64")}`,
    })),
  };
};

const schema = require("../../db/schema");
const { gapsBetween } = require("../../db/schemaDiff");
const { buildModels } = require("../../models");
const { uploadPath } = require("../../utils/files/uploads");
const { UPLOAD_DIR } = require("../../config/paths");
const { freshDb, startApp, signIn, csrfFor } = require("../helpers/app");

const savedFiles = [];

test.after(() => {
  for (const full of savedFiles) fs.rmSync(full, { force: true });
});

function post(base, cookie, csrf, path, body) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf, cookie },
    body: JSON.stringify(body),
  });
}

async function generateAndSave(base, cookie, csrf, body) {
  const { images } = await (await post(base, cookie, csrf, "/api/generate", body)).json();
  const ids = [];
  for (const image of images) {
    const saved = await (await post(base, cookie, csrf, "/api/save", { token: image.token })).json();
    const filename = saved.url.replace("/uploads/", "");
    savedFiles.push(uploadPath(filename, UPLOAD_DIR).full);
    ids.push(filename);
  }
  return ids;
}

function rowFor(db, filename) {
  return db.prepare("SELECT * FROM generations WHERE filename = ?").get(filename);
}

function clockChip(html) {
  const found = /fa-regular fa-clock[^<]*<\/i>\s*([^<]+)<\/span>/.exec(html);
  return found ? found[1].trim() : null;
}

test("a generated image is saved with how long it took", async () => {
  const db = freshDb();
  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const csrf = await csrfFor(app.base, cookie);

    const [filename] = await generateAndSave(app.base, cookie, csrf, {
      prompt: "a red bicycle",
      size: "1024x1024",
      model: "1.5",
    });

    assert.equal(rowFor(db, filename).duration_ms, 8421);
  } finally {
    app.stop();
    db.close();
  }
});

test("every image in a batch keeps the whole wait", async () => {
  const db = freshDb();
  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const csrf = await csrfFor(app.base, cookie);

    const files = await generateAndSave(app.base, cookie, csrf, {
      prompt: "a red bicycle",
      size: "1024x1024",
      count: "4",
    });

    assert.equal(files.length, 4);
    for (const filename of files) {
      assert.equal(rowFor(db, filename).duration_ms, 38200);
    }
  } finally {
    app.stop();
    db.close();
  }
});

test("each model in a comparison keeps its own time", async () => {
  const db = freshDb();
  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const csrf = await csrfFor(app.base, cookie);

    const files = await generateAndSave(app.base, cookie, csrf, {
      prompt: "a red bicycle",
      size: "1024x1024",
      compare: "1",
    });

    assert.ok(files.length > 1);
    for (const filename of files) {
      const row = rowFor(db, filename);
      assert.equal(row.duration_ms, TIMES[row.model], row.model);
    }
  } finally {
    app.stop();
    db.close();
  }
});

test("the shared page and the generations card show the time", async () => {
  const db = freshDb();
  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const csrf = await csrfFor(app.base, cookie);
    const [filename] = await generateAndSave(app.base, cookie, csrf, {
      prompt: "a red bicycle",
      size: "1024x1024",
      model: "1.5",
    });

    const { Generation, Settings } = buildModels(db);
    Settings.update({ public_share: 1 });
    Generation.setShareToken(rowFor(db, filename).id, "DURATION01");

    const shared = await (await fetch(`${app.base}/s/DURATION01`)).text();
    assert.equal(clockChip(shared), "8.4s");

    const list = await (
      await fetch(`${app.base}/generations`, { headers: { cookie } })
    ).text();
    assert.match(list, /tokens( · \$[\d.]+)? · 8\.4s</);
  } finally {
    app.stop();
    db.close();
  }
});

test("a favourite's own page shows the time", async () => {
  const db = freshDb();
  const { Generation, Settings } = buildModels(db);
  const id = Generation.add({
    filename: `${process.pid}-fav.png`,
    prompt: "a starred cat",
    model: "gpt-image-2",
    size: "1024x1024",
    duration_ms: 65000,
  });
  Generation.toggleFavorite(id);
  Settings.update({ public_favourites: 1 });
  const token = Settings.shareFavourites(() => "FAVDURATION1");
  const app = await startApp({ db });
  try {
    const html = await (await fetch(`${app.base}/f/${token}/i/${id}`)).text();
    assert.equal(clockChip(html), "1m 05s");
  } finally {
    app.stop();
    db.close();
  }
});

test("the card shows the time even with no token count", async () => {
  const db = freshDb();
  const { Generation } = buildModels(db);
  Generation.add({
    filename: `${process.pid}-untokened.png`,
    prompt: "no usage came back",
    size: "1024x1024",
    duration_ms: 8421,
  });
  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const list = await (
      await fetch(`${app.base}/generations`, { headers: { cookie } })
    ).text();
    assert.match(list, /<span class="chip">8\.4s<\/span>/);
  } finally {
    app.stop();
    db.close();
  }
});

test("an image with no time shows no clock", async () => {
  const db = freshDb();
  const { Generation, Settings } = buildModels(db);
  const id = Generation.add({
    filename: `${process.pid}-upload.png`,
    prompt: "an upload",
    size: "1024x1024",
  });
  Settings.update({ public_share: 1 });
  Generation.setShareToken(id, "NOTIME0001");
  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const shared = await (await fetch(`${app.base}/s/NOTIME0001`)).text();
    assert.equal(shared.includes("fa-clock"), false);

    const list = await (
      await fetch(`${app.base}/generations`, { headers: { cookie } })
    ).text();
    assert.equal(list.includes("fa-clock"), false);
    assert.doesNotMatch(list, / · \d+(\.\d)?s</);
  } finally {
    app.stop();
    db.close();
  }
});

test("a database migrated with what schema-gaps prints stores and shows the time", async () => {
  const want = new Database(":memory:");
  schema.init(want);

  const live = new Database(":memory:");
  schema.init(live);
  live.exec("DROP VIEW live_generations");
  live.exec("ALTER TABLE generations DROP COLUMN duration_ms");
  live.exec(
    "CREATE VIEW live_generations AS SELECT * FROM generations WHERE deleted_at IS NULL"
  );

  const printed = gapsBetween(want, live)
    .filter((gap) => gap.kind === "column" && gap.table === "generations")
    .map((gap) => gap.sql);
  assert.deepEqual(printed, ["ALTER TABLE generations ADD COLUMN duration_ms INTEGER;"]);
  printed.forEach((sql) => live.exec(sql));

  const { Generation, Settings } = buildModels(live);
  const old = Generation.add({ filename: `${process.pid}-old.png`, prompt: "old" });
  live.prepare("UPDATE generations SET duration_ms = NULL WHERE id = ?").run(old);
  const fresh = Generation.add({
    filename: `${process.pid}-new.png`,
    prompt: "new",
    duration_ms: 8421,
  });
  assert.equal(Generation.get(fresh).duration_ms, 8421);

  Settings.update({ public_share: 1 });
  Generation.setShareToken(old, "MIGRATED01");
  Generation.setShareToken(fresh, "MIGRATED02");

  const app = await startApp({ db: live });
  try {
    const before = await fetch(`${app.base}/s/MIGRATED01`);
    assert.equal(before.status, 200);
    assert.equal((await before.text()).includes("fa-clock"), false);

    const after = await (await fetch(`${app.base}/s/MIGRATED02`)).text();
    assert.equal(clockChip(after), "8.4s");
  } finally {
    app.stop();
    want.close();
    live.close();
  }
});
