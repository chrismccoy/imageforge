/**
 * Uploading several images at once
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
const { UPLOAD_MAX_FILES } = require("../../config/limits");
const { dataWidget } = require("../helpers/dom");

function imageBuf(kind) {
  const b = Buffer.alloc(64, 0x20);
  if (kind === "png") [0x89, 0x50, 0x4e, 0x47].forEach((v, i) => (b[i] = v));
  if (kind === "jpg") [0xff, 0xd8, 0xff].forEach((v, i) => (b[i] = v));
  return b;
}

function cookieFrom(res) {
  const set = res.headers.getSetCookie();
  return set && set.length ? set.map((c) => c.split(";")[0]).join("; ") : null;
}

async function startApp() {
  const db = new Database(":memory:");
  schema.init(db);
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-bulk-"));
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
    models: buildModels(db),
    uploadDir,
    cookie: cookieFrom(posted) || first,
    stop() {
      server.close();
      db.close();
      fs.rmSync(uploadDir, { recursive: true, force: true });
    },
  };
}

async function upload(app, entries, body = {}) {
  const token = /name="_csrf" value="([^"]+)"/.exec(
    await (
      await fetch(`${app.base}/upload`, { headers: { cookie: app.cookie } })
    ).text()
  )[1];

  const form = new FormData();
  form.set("_csrf", token);
  form.set("size", "1024x1024");
  for (const [key, value] of Object.entries(body)) form.set(key, value);

  for (const [name, kind] of entries) {
    const bytes =
      kind === "text" ? Buffer.from("not an image at all") : imageBuf(kind);
    const type = kind === "text" ? "text/plain" : `image/${kind}`;
    form.append("image", new Blob([bytes], { type }), name);
  }

  const res = await fetch(`${app.base}/upload`, {
    method: "POST",
    headers: { cookie: app.cookie },
    body: form,
    redirect: "manual",
  });

  return { status: res.status, location: res.headers.get("location"), res };
}

async function uploadResultHtml() {
  const app = await startApp();
  const out = await upload(app, [
    ["good.png", "png"],
    ["notes.txt", "text"],
    ["also-good.jpg", "jpg"],
  ]);
  return { html: await out.res.text(), stop: app.stop, db: app.db };
}

test("several images in one post are all saved", async () => {
  const app = await startApp();
  try {
    const out = await upload(app, [
      ["one.png", "png"],
      ["two.png", "png"],
      ["three.jpg", "jpg"],
    ]);

    assert.equal(out.status, 302, "all of them went in, so on to the list");
    assert.equal(out.location, "/generations");
    assert.equal(app.models.Generation.all().length, 3);
  } finally {
    app.stop();
  }
});

test("every image in a batch gets the same prompt, model and size", async () => {
  const app = await startApp();
  try {
    const id = app.models.Prompt.add("Sky", "a blue sky");
    await upload(
      app,
      [
        ["one.png", "png"],
        ["two.png", "png"],
      ],
      { prompt_id: String(id), size: "1536x1024" }
    );

    const rows = app.models.Generation.all();
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.equal(row.prompt, "a blue sky");
      assert.equal(row.size, "1536x1024");
    }
  } finally {
    app.stop();
  }
});

test("one file the app will not take does not cost you the others", async () => {
  const app = await startApp();
  try {
    const out = await upload(app, [
      ["good.png", "png"],
      ["notes.txt", "text"],
      ["also-good.jpg", "jpg"],
    ]);

    assert.equal(app.models.Generation.all().length, 2, "the two images are in");

    const html = await out.res.text();
    assert.match(html, /notes\.txt/, "and the page says which one was refused");
    assert.match(html, /good\.png/, "beside what did go in, so the count is clear");

    const widget = dataWidget(html, "upload-results", "section");
    assert.match(
      widget,
      /See what was saved/,
      "a partly-successful batch offers the link"
    );
  } finally {
    app.stop();
  }
});

test("a mixed batch reports each file with an icon", async () => {
  const { html, stop, db } = await uploadResultHtml();
  try {
    const widget = dataWidget(html, "upload-results", "section");
    assert.match(widget, /class="[^"]*card-head[\s\S]*Last upload/);
    assert.match(widget, /pill-green[\s\S]*Saved/);
  } finally {
    stop();
    db.close();
  }
});

test("a batch that saved nothing says so rather than looking like success", async () => {
  const app = await startApp();
  try {
    const out = await upload(app, [
      ["notes.txt", "text"],
      ["more.txt", "text"],
    ]);

    assert.equal(out.status, 400);
    assert.equal(app.models.Generation.all().length, 0);

    const html = await out.res.text();
    const widget = dataWidget(html, "upload-results", "section");
    assert.doesNotMatch(
      widget,
      /See what was saved/,
      "an all-refused batch offers no such link"
    );
  } finally {
    app.stop();
  }
});

test("posting no file at all still asks for one", async () => {
  const app = await startApp();
  try {
    const out = await upload(app, []);
    assert.equal(out.status, 400);
    assert.match(await out.res.text(), /Choose an image to upload/);
  } finally {
    app.stop();
  }
});

test("more files than the cap is refused, and the refusal says how many", async () => {
  const app = await startApp();
  try {
    const tooMany = Array.from({ length: UPLOAD_MAX_FILES + 1 }, (_unused, at) => [
      `image-${at}.png`,
      "png",
    ]);

    const out = await upload(app, tooMany);
    const html = await out.res.text();

    assert.match(html, new RegExp(String(UPLOAD_MAX_FILES)), "it names the limit");
    assert.equal(
      app.models.Generation.all().length,
      0,
      "and nothing is written from a post that was refused"
    );
  } finally {
    app.stop();
  }
});

test("the form invites more than one file", async () => {
  const app = await startApp();
  try {
    const html = await (
      await fetch(`${app.base}/upload`, { headers: { cookie: app.cookie } })
    ).text();
    assert.match(html, /<input[^>]*id="image"[^>]*multiple/);
  } finally {
    app.stop();
  }
});

test("the drop zone is hidden by the attribute alone, so it can be shown", async () => {
  const app = await startApp();
  try {
    const html = await (
      await fetch(`${app.base}/upload`, { headers: { cookie: app.cookie } })
    ).text();

    const revealed = ["data-drop-zone", "data-drop-error", "data-drop-preview"];
    for (const hook of revealed) {
      const tag = new RegExp(`<[a-z]+[^>]*${hook}[^>]*>`).exec(html)[0];
      const classes = /class="([^"]*)"/.exec(tag);
      const names = classes ? classes[1].split(/\s+/) : [];
      assert.ok(
        !names.includes("hidden"),
        `${hook} must not carry a hidden class: ${names.join(" ")}`
      );
      assert.match(tag, /\shidden[\s>]/, `${hook} is hidden by the attribute`);
    }

    const zone = /<button[^>]*data-drop-zone[^>]*>/.exec(html)[0];

    assert.doesNotMatch(zone, /class="[^"]*\bhidden\b/, "no hidden class");
    assert.match(zone, /\shidden[\s>]/, "the attribute is what hides it");
  } finally {
    app.stop();
  }
});
