/**
 * Generate then save integration test
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "secret123";
process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const Database = require("better-sqlite3");

const openai = require("../../services/openai");

const IMAGE_BYTES = Buffer.from("PNGBYTES");
const USAGE = {
  total: 1265,
  input: 15,
  output: 1250,
  inputText: 15,
  inputImage: 0,
  outputText: 194,
  outputImage: 1056,
};

openai.generateImage = async () => ({
  model: "gpt-image-1.5",
  usage: USAGE,
  images: [
    {
      bytes: IMAGE_BYTES,
      dataUrl: `data:image/png;base64,${IMAGE_BYTES.toString("base64")}`,
    },
  ],
});

const { createApp } = require("../../server");
const { uploadPath } = require("../../utils/files/uploads");
const { UPLOAD_DIR } = require("../../config/paths");

let server;
let base;
let appDb;
let cookie = "";
const savedFiles = [];

function capture(res) {
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of setCookies) {
    if (c.startsWith("connect.sid=")) cookie = c.split(";")[0];
  }
  return res;
}

function csrfFrom(html) {
  const m = html.match(/name="csrf-token"\s+content="([^"]*)"/);
  return m ? m[1] : "";
}

test.before(async () => {
  appDb = new Database(":memory:");
  const app = createApp({ db: appDb });
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  server.close();
  for (const full of savedFiles) {
    try {
      fs.unlinkSync(full);
    } catch (_err) {
    }
  }
});

test("generate then save writes bytes reachable only when authenticated", async () => {
  const loginPage = capture(await fetch(`${base}/login`, { headers: { cookie } }));
  const loginCsrf = csrfFrom(await loginPage.text());
  assert.ok(loginCsrf, "login page should expose a CSRF token");

  const loginRes = capture(
    await fetch(`${base}/login`, {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded", cookie },
      body: new URLSearchParams({
        username: "admin",
        password: "secret123",
        _csrf: loginCsrf,
      }),
    })
  );
  assert.equal(loginRes.status, 302);
  assert.equal(loginRes.headers.get("location"), "/");

  const home = capture(await fetch(`${base}/`, { headers: { cookie } }));
  assert.equal(home.status, 200);
  const csrf = csrfFrom(await home.text());
  assert.ok(csrf, "authenticated page should expose a CSRF token");

  const genRes = await fetch(`${base}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf, cookie },
    body: JSON.stringify({ prompt: "a red bicycle", size: "1024x1024" }),
  });
  assert.equal(genRes.status, 200);
  const [gen] = (await genRes.json()).images;
  assert.ok(gen.token, "generate should return a claim token");
  assert.match(gen.url, /^data:image\/png;base64,/);

  const saveRes = await fetch(`${base}/api/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf, cookie },
    body: JSON.stringify({ token: gen.token, prompt_id: "" }),
  });
  assert.equal(saveRes.status, 200);
  const saved = await saveRes.json();
  assert.match(saved.url, /^\/uploads\/image-forge-/);

  const filename = saved.url.replace("/uploads/", "");
  const { full } = uploadPath(filename, UPLOAD_DIR);
  savedFiles.push(full);
  assert.ok(fs.existsSync(full), "saved image should be on disk");
  assert.deepEqual(fs.readFileSync(full), IMAGE_BYTES);

  const imgRes = await fetch(`${base}${saved.url}`, { headers: { cookie } });
  assert.equal(imgRes.status, 200);
  assert.equal(imgRes.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await imgRes.arrayBuffer()), IMAGE_BYTES);

  const anon = await fetch(`${base}${saved.url}`, { redirect: "manual" });
  assert.equal(anon.status, 302);
  assert.equal(anon.headers.get("location"), "/login");
});

test("a spent claim token cannot be saved twice", async () => {
  const home = capture(await fetch(`${base}/`, { headers: { cookie } }));
  const csrf = csrfFrom(await home.text());

  const [gen] = (
    await (
      await fetch(`${base}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
          cookie,
        },
        body: JSON.stringify({ prompt: "a blue kite", size: "1024x1024" }),
      })
    ).json()
  ).images;

  const first = await fetch(`${base}/api/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf, cookie },
    body: JSON.stringify({ token: gen.token }),
  });
  assert.equal(first.status, 200);
  savedFiles.push(
    uploadPath((await first.json()).url.replace("/uploads/", ""), UPLOAD_DIR).full
  );

  const second = await fetch(`${base}/api/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf, cookie },
    body: JSON.stringify({ token: gen.token }),
  });
  assert.equal(second.status, 400);
  assert.match((await second.json()).message, /Nothing to save/);
});

test("the token usage reaches the saved row", async () => {
  const home = capture(await fetch(`${base}/`, { headers: { cookie } }));
  const csrf = csrfFrom(await home.text());

  const [gen] = (
    await (
      await fetch(`${base}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
          cookie,
        },
        body: JSON.stringify({ prompt: "a counted bicycle", size: "1024x1024" }),
      })
    ).json()
  ).images;

  const saved = await (
    await fetch(`${base}/api/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf, cookie },
      body: JSON.stringify({ token: gen.token, prompt_id: "" }),
    })
  ).json();
  savedFiles.push(uploadPath(saved.url.replace("/uploads/", ""), UPLOAD_DIR).full);

  const row = appDb
    .prepare("SELECT * FROM generations ORDER BY id DESC LIMIT 1")
    .get();

  assert.equal(row.usage_total_tokens, 1265);
  assert.equal(row.usage_output_text_tokens, 194);
  assert.equal(row.usage_input_image_tokens, 0);
});
