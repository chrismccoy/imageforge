/**
 * Cropping a saved image
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Database = require("better-sqlite3");

const schema = require("../../db/schema");
const { buildModels } = require("../../models");
const { createApp } = require("../../server");

const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082",
  "hex"
);

function cookieFrom(res) {
  const set = res.headers.getSetCookie();
  return set && set.length ? set.map((c) => c.split(";")[0]).join("; ") : null;
}

async function startApp() {
  const db = new Database(":memory:");
  schema.init(db);
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-crop-"));
  fs.writeFileSync(path.join(uploadDir, "source.png"), PNG);

  const models = buildModels(db);
  const promptId = models.Prompt.add("Sky", "a blue sky");
  const sourceId = models.Generation.add({
    filename: "source.png",
    prompt: "a blue sky",
    prompt_id: promptId,
    model: "gpt-image-2",
    size: "1024x1024",
  });

  const app = createApp({ db, folders: { uploadDir } });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));

  const base = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(`${base}/login`);
  const csrf = /name="_csrf" value="([^"]+)"/.exec(await page.text())[1];
  const first = cookieFrom(page);
  const posted = await fetch(`${base}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie: first },
    body: `_csrf=${csrf}&username=admin&password=test-pass`,
    redirect: "manual",
  });

  return {
    base,
    db,
    models,
    sourceId: Number(sourceId),
    promptId: Number(promptId),
    uploadDir,
    cookie: cookieFrom(posted) || first,
    stop() {
      server.close();
      db.close();
      fs.rmSync(uploadDir, { recursive: true, force: true });
    },
  };
}

async function tokenFor(app) {
  const html = await (
    await fetch(`${app.base}/crop/${app.sourceId}`, {
      headers: { cookie: app.cookie },
    })
  ).text();
  const found = /name="csrf-token" content="([^"]*)"/.exec(html);
  return found ? found[1] : "";
}

async function crop(app, { bytes = PNG, sourceId, csrf, size = "800x600" } = {}) {
  const form = new FormData();
  form.set("_csrf", csrf === undefined ? await tokenFor(app) : csrf);
  form.set("source_id", String(sourceId === undefined ? app.sourceId : sourceId));
  form.set("size", size);
  form.append("image", new Blob([bytes], { type: "image/png" }), "crop.png");

  const res = await fetch(`${app.base}/api/crop`, {
    method: "POST",
    headers: { cookie: app.cookie },
    body: form,
  });

  return { status: res.status, body: await res.json().catch(() => null) };
}

test("a crop is held for saving, and comes back with something to show", async () => {
  const app = await startApp();
  try {
    const out = await crop(app);

    assert.equal(out.status, 200);
    assert.ok(out.body.token, "there is a token to save with");
    assert.match(out.body.url, /^data:image\/png;base64,/, "and a picture to show");
  } finally {
    app.stop();
  }
});

test("saving the crop writes a new image, and keeps the one it came from", async () => {
  const app = await startApp();
  try {
    const held = await crop(app);
    const res = await fetch(`${app.base}/api/save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": await tokenFor(app),
        cookie: app.cookie,
      },
      body: JSON.stringify({ token: held.body.token }),
    });

    assert.equal(res.status, 200);

    const rows = app.models.Generation.all();
    assert.equal(rows.length, 2, "the original and the crop");

    const cropped = app.models.Generation.get(
      rows.find((row) => row.id !== app.sourceId).id
    );
    assert.equal(cropped.edited_from, app.sourceId, "it knows where it came from");
    assert.equal(cropped.prompt, "a blue sky", "and carries the prompt with it");
    assert.equal(cropped.prompt_id, app.promptId);
    assert.equal(cropped.size, "800x600", "recorded at the size it really is");
  } finally {
    app.stop();
  }
});

test("a crop costs nothing, so the ledger does not move", async () => {
  const app = await startApp();
  try {
    const before = app.db.prepare("SELECT COUNT(*) AS n FROM model_spend").get().n;

    const held = await crop(app);
    await fetch(`${app.base}/api/save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": await tokenFor(app),
        cookie: app.cookie,
      },
      body: JSON.stringify({ token: held.body.token }),
    });

    const spend = app.db.prepare("SELECT * FROM model_spend").all();
    assert.equal(spend.length, before, "no model was charged for a crop");

    const cropped = app.models.Generation.get(
      app.models.Generation.all().find((row) => row.id !== app.sourceId).id
    );
    assert.equal(cropped.usage_total_tokens, null, "and no tokens are claimed");
  } finally {
    app.stop();
  }
});

test("a crop of an image that is not there is refused", async () => {
  const app = await startApp();
  try {
    assert.equal((await crop(app, { sourceId: 9999 })).status, 404);
  } finally {
    app.stop();
  }
});

test("a crop of an image in the trash is refused", async () => {
  const app = await startApp();
  try {
    app.models.Generation.trash(app.sourceId);
    assert.equal((await crop(app)).status, 404);
  } finally {
    app.stop();
  }
});

test("bytes that are not a picture are refused", async () => {
  const app = await startApp();
  try {
    const out = await crop(app, { bytes: Buffer.from("not a picture at all") });
    assert.equal(out.status, 400);
  } finally {
    app.stop();
  }
});

test("a post with no picture at all is refused", async () => {
  const app = await startApp();
  try {
    const form = new FormData();
    form.set("_csrf", await tokenFor(app));
    form.set("source_id", String(app.sourceId));

    const res = await fetch(`${app.base}/api/crop`, {
      method: "POST",
      headers: { cookie: app.cookie },
      body: form,
    });
    assert.equal(res.status, 400);
  } finally {
    app.stop();
  }
});

test("a forged post is refused and holds nothing", async () => {
  const app = await startApp();
  try {
    assert.equal((await crop(app, { csrf: "WRONG" })).status, 403);
  } finally {
    app.stop();
  }
});

test("the page is there for a saved image, and not for one in the trash", async () => {
  const app = await startApp();
  try {
    const ok = await fetch(`${app.base}/crop/${app.sourceId}`, {
      headers: { cookie: app.cookie },
    });
    const html = await ok.text();

    assert.equal(ok.status, 200);
    assert.match(html, /id="crop-box"/, "there is a box to drag");
    assert.match(html, /src="\/js\/crop\.js"/);
    assert.match(html, /data-ratio="1"/, "and the shapes the app generates at");

    app.models.Generation.trash(app.sourceId);
    const gone = await fetch(`${app.base}/crop/${app.sourceId}`, {
      headers: { cookie: app.cookie },
    });
    assert.equal(gone.status, 404);
  } finally {
    app.stop();
  }
});

test("the page is behind the login", async () => {
  const app = await startApp();
  try {
    const res = await fetch(`${app.base}/crop/${app.sourceId}`, {
      redirect: "manual",
    });
    assert.equal(res.status, 302);
  } finally {
    app.stop();
  }
});

test("the generations list offers a crop", async () => {
  const app = await startApp();
  try {
    const html = await (
      await fetch(`${app.base}/generations`, { headers: { cookie: app.cookie } })
    ).text();
    assert.match(html, new RegExp(`/crop/${app.sourceId}`));
  } finally {
    app.stop();
  }
});
