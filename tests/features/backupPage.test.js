/**
 * Backup page tests
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
const { createApp } = require("../../server");
const { dataWidget } = require("../helpers/dom");

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

async function startApp() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "forge-backup-page-"));
  const uploadDir = path.join(root, "uploads");
  const backupDir = path.join(root, "backups");
  fs.mkdirSync(uploadDir);

  const db = new Database(":memory:");
  schema.init(db);
  const models = require("../../models").buildModels(db);
  models.Prompt.add("Sunsets", "a sunset");
  fs.writeFileSync(path.join(uploadDir, "a-cat.png"), PNG);
  models.Generation.add({
    filename: "a-cat.png",
    prompt: "a cat",
    model: "gpt-image-2",
    size: "1024x1024",
  });

  const app = createApp({ db, folders: { uploadDir, backupDir } });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));

  return {
    base: `http://127.0.0.1:${server.address().port}`,
    backupDir,
    stop() {
      server.close();
      db.close();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

async function backupHtml() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "forge-backup-html-"));
  const uploadDir = path.join(root, "uploads");
  const backupDir = path.join(root, "backups");
  fs.mkdirSync(uploadDir);

  const db = new Database(":memory:");
  schema.init(db);

  const app = createApp({ db, folders: { uploadDir, backupDir } });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const { html } = await signIn(base);

  return {
    html,
    db,
    stop() {
      server.close();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

function cookieFrom(res) {
  const set = res.headers.getSetCookie();
  return set && set.length ? set.map((c) => c.split(";")[0]).join("; ") : null;
}

async function signIn(base) {
  const page = await fetch(`${base}/login`);
  const loginCsrf = /name="_csrf" value="([^"]+)"/.exec(await page.text())[1];
  const loginCookie = cookieFrom(page);

  const res = await fetch(`${base}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      cookie: loginCookie,
    },
    body: `_csrf=${loginCsrf}&username=admin&password=test-pass`,
    redirect: "manual",
  });
  const cookie = cookieFrom(res) || loginCookie;

  const html = await (
    await fetch(`${base}/prompts/backup`, { headers: { cookie } })
  ).text();
  return { cookie, csrf: /name="_csrf" value="([^"]+)"/.exec(html)[1], html };
}

function post(base, url, cookie, csrf) {
  return fetch(`${base}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams({ _csrf: csrf }).toString(),
    redirect: "manual",
  });
}

test("the page creates a backup and then lists it", async () => {
  const app = await startApp();
  try {
    const { cookie, csrf, html } = await signIn(app.base);
    assert.match(
      html,
      /No backups yet|no backups/i,
      "it says so when there are none"
    );

    const res = await post(app.base, "/backups", cookie, csrf);
    assert.equal(res.status, 302);

    const written = fs.readdirSync(app.backupDir);
    assert.equal(written.length, 1, "one archive on disk");
    assert.match(written[0], /^imageforge-\d{8}-\d{6}\.zip$/);

    const after = await (
      await fetch(`${app.base}/prompts/backup`, { headers: { cookie } })
    ).text();
    assert.match(after, new RegExp(written[0]), "and the page lists it");
  } finally {
    app.stop();
  }
});

test("a backup downloads as a zip", async () => {
  const app = await startApp();
  try {
    const { cookie, csrf } = await signIn(app.base);
    await post(app.base, "/backups", cookie, csrf);
    const name = fs.readdirSync(app.backupDir)[0];

    const res = await fetch(`${app.base}/backups/${name}`, { headers: { cookie } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-disposition"), new RegExp(name));

    const bytes = Buffer.from(await res.arrayBuffer());
    assert.equal(bytes.subarray(0, 2).toString(), "PK");
    assert.equal(bytes.length, fs.statSync(path.join(app.backupDir, name)).size);
  } finally {
    app.stop();
  }
});

test("a backup can be deleted", async () => {
  const app = await startApp();
  try {
    const { cookie, csrf } = await signIn(app.base);
    await post(app.base, "/backups", cookie, csrf);
    const name = fs.readdirSync(app.backupDir)[0];

    const res = await post(app.base, `/backups/${name}/delete`, cookie, csrf);
    assert.equal(res.status, 302);
    assert.deepEqual(fs.readdirSync(app.backupDir), []);
  } finally {
    app.stop();
  }
});

test("no name can name a file outside the folder", () => {
  const { backupPath } = require("../../utils/files/backups");
  const dir = "/var/data/backups";

  assert.equal(
    backupPath(dir, "imageforge-1.zip").full,
    "/var/data/backups/imageforge-1.zip"
  );

  for (const name of [
    "../../.env",
    "../../data/imageforge.db",
    "../uploads/a-cat.png",
    "/etc/passwd.zip",
    "../secret.zip",
    "..",
    "",
    ".zip",
  ]) {
    const found = backupPath(dir, name);
    assert.ok(
      found === null || found.full === `${dir}/${require("path").basename(name)}`,
      `${name} stayed inside`
    );
  }
});

test("a name that climbs out of the backups folder is refused", async () => {
  const app = await startApp();
  try {
    const { cookie, csrf } = await signIn(app.base);

    for (const name of [
      "..%2f..%2f.env",
      "..%2f..%2fdata%2fimageforge.db",
      "..%2fuploads%2fa-cat.png",
    ]) {
      const res = await fetch(`${app.base}/backups/${name}`, {
        headers: { cookie },
        redirect: "manual",
      });
      assert.equal(res.status, 404, `GET /backups/${name}`);

      const gone = await post(app.base, `/backups/${name}/delete`, cookie, csrf);
      assert.equal(gone.status, 404, `POST /backups/${name}/delete`);
    }

    assert.ok(
      fs.existsSync(path.join(app.backupDir, "..", "uploads", "a-cat.png"))
    );
  } finally {
    app.stop();
  }
});

test("the page offers no way to restore", async () => {
  const app = await startApp();
  try {
    const { cookie, csrf, html } = await signIn(app.base);
    await post(app.base, "/backups", cookie, csrf);
    const listed = await (
      await fetch(`${app.base}/prompts/backup`, { headers: { cookie } })
    ).text();

    for (const page of [html, listed]) {
      assert.equal(/action="[^"]*restore/i.test(page), false, "no restore form");
      assert.equal(/type="file"[^>]*zip/i.test(page), false, "no archive upload");
    }
    assert.match(listed, /scripts\/restore\.js/);

    const res = await post(app.base, "/backups/restore", cookie, csrf);
    assert.equal(res.status, 404, "and no route behind it either");
  } finally {
    app.stop();
  }
});

test("the restore instruction is shown as a command", async () => {
  const { html, stop, db } = await backupHtml();
  try {
    assert.match(html, /fa-solid fa-terminal/);
    assert.match(html, /node scripts\/restore\.js/);
  } finally {
    stop();
    db.close();
  }
});

test('the import card explains what "ignored" means', async () => {
  const { html, stop, db } = await backupHtml();
  try {
    const card = dataWidget(html, "import-prompts", "section");
    assert.match(
      card,
      /no name or no prompt text is counted as ignored rather than stopping/
    );
  } finally {
    stop();
    db.close();
  }
});
