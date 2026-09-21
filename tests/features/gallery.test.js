/**
 * Gallery tests
 */

"use strict";

process.env.NODE_ENV = "test";

process.env.PUBLIC_SHARE = "";
process.env.PUBLIC_GALLERY = "";

process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";

process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";

const test = require("node:test");
const assert = require("node:assert/strict");

const { VIEWS } = require("../../config/views");
const { env } = require("../../config/env");
const buildGeneration = require("../../models/generation");
const { freshDb, uploadFixture, startApp, signIn } = require("../helpers/app");

function freshEnv() {
  delete require.cache[require.resolve("../../config/env")];
  delete require.cache[require.resolve("../../utils/security/secretBox")];
  return require("../../config/env");
}

test("the gallery flag is off unless the environment turns it on", () => {
  assert.equal(typeof env.PUBLIC_GALLERY, "boolean");
  assert.equal(env.PUBLIC_GALLERY, false);
});

test("the gallery view is named in the view table", () => {
  assert.equal(VIEWS.GALLERY, "gallery");
});

test("a gallery without public sharing is a startup error", () => {
  process.env.PUBLIC_GALLERY = "true";
  process.env.PUBLIC_SHARE = "";
  try {
    const problems = freshEnv().configProblems();
    assert.ok(
      problems.some((m) => /PUBLIC_GALLERY requires PUBLIC_SHARE/.test(m)),
      "the combination should be reported"
    );
  } finally {
    process.env.PUBLIC_GALLERY = "";
    freshEnv();
  }
});

test("a gallery with public sharing is accepted", () => {
  process.env.PUBLIC_GALLERY = "true";
  process.env.PUBLIC_SHARE = "true";
  try {
    const problems = freshEnv().configProblems();
    assert.equal(
      problems.some((m) => /PUBLIC_GALLERY/.test(m)),
      false
    );
  } finally {
    process.env.PUBLIC_GALLERY = "";
    process.env.PUBLIC_SHARE = "";
    freshEnv();
  }
});

test("public sharing without a gallery is accepted", () => {
  process.env.PUBLIC_SHARE = "true";
  try {
    const problems = freshEnv().configProblems();
    assert.equal(
      problems.some((m) => /PUBLIC_GALLERY/.test(m)),
      false
    );
  } finally {
    process.env.PUBLIC_SHARE = "";
    freshEnv();
  }
});

const upload = uploadFixture("gallery-test");
const galleryFile = upload.filename;

test.after(() => upload.remove());

function addImage(Generation, prompt, token) {
  Generation.add({
    filename: galleryFile,
    prompt,
    model: "1.5",
    size: "1024x1024",
  });
  const id = Generation.all()[0].id;
  if (token) Generation.setShareToken(id, token);
  return id;
}

test("the share pages and image tell crawlers not to index them", async () => {
  const db = freshDb();
  addImage(buildGeneration(db), "a crawled cat", "tok-robots");
  const app = await startApp({ db });
  try {
    const page = await fetch(`${app.base}/s/tok-robots`);
    assert.equal(page.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.match(await page.text(), /name="robots" content="noindex, nofollow"/);

    const image = await fetch(`${app.base}/i/tok-robots`);
    assert.equal(image.headers.get("x-robots-tag"), "noindex, nofollow");

    const missing = await fetch(`${app.base}/s/nope`);
    assert.equal(missing.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.match(await missing.text(), /name="robots" content="noindex, nofollow"/);
  } finally {
    app.stop();
    db.close();
  }
});

test("a dashboard page is not marked noindex", async () => {
  const db = freshDb();
  const app = await startApp({ db });
  try {
    const res = await fetch(`${app.base}/login`);
    assert.equal(res.headers.get("x-robots-tag"), null);
    assert.equal((await res.text()).includes('name="robots"'), false);
  } finally {
    app.stop();
    db.close();
  }
});

test("only shared images are counted and listed", () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  addImage(Generation, "private one");
  addImage(Generation, "public one", "tok-a");
  addImage(Generation, "private two");
  addImage(Generation, "public two", "tok-b");

  assert.equal(Generation.count(), 4);
  assert.equal(Generation.countShared(), 2);

  const rows = Generation.pageShared({ limit: 10, offset: 0 });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.prompt).sort(), ["public one", "public two"]);
  db.close();
});

test("the shared list pages and puts the newest first", () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  addImage(Generation, "first", "tok-1");
  addImage(Generation, "second", "tok-2");
  addImage(Generation, "third", "tok-3");

  const firstPage = Generation.pageShared({ limit: 2, offset: 0 });
  assert.equal(firstPage.length, 2);
  assert.equal(firstPage[0].prompt, "third");

  const secondPage = Generation.pageShared({ limit: 2, offset: 2 });
  assert.equal(secondPage.length, 1);
  assert.equal(secondPage[0].prompt, "first");
  db.close();
});

test("unsharing removes an image from the shared list", () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const id = addImage(Generation, "temporary", "tok-temp");
  assert.equal(Generation.countShared(), 1);

  Generation.clearShareToken(id);
  assert.equal(Generation.countShared(), 0);
  assert.deepEqual(Generation.pageShared({ limit: 10, offset: 0 }), []);
  db.close();
});

test("with the gallery off, an anonymous visitor is sent to the login", async () => {
  const db = freshDb();
  addImage(buildGeneration(db), "hidden", "tok-hidden");
  const app = await startApp({ db });
  try {
    const res = await fetch(`${app.base}/gallery`, { redirect: "manual" });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/login");
  } finally {
    app.stop();
    db.close();
  }
});

test("with the gallery off, the operator can still preview it", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  addImage(Generation, "private one");
  addImage(Generation, "public one", "tok-shown");

  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const res = await fetch(`${app.base}/gallery`, { headers: { cookie } });
    assert.equal(res.status, 200);
    const html = await res.text();

    assert.match(html, /href="\/s\/tok-shown"/);
    assert.match(html, /src="\/i\/tok-shown\.png"/);
    assert.equal(html.includes(galleryFile), false);

    assert.equal(html.includes("private one"), false);
    assert.equal(html.includes("Log out"), false);

    assert.equal(res.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.match(html, /name="robots" content="noindex, nofollow"/);

    assert.match(html, /fa-gauge-high/);
    assert.match(html, /Dashboard/);
  } finally {
    app.stop();
    db.close();
  }
});

test("the gallery pages with pretty routes and clamps a page past the end", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  db.prepare("UPDATE settings SET page_size = 1 WHERE id = 1").run();
  addImage(Generation, "older", "tok-older");
  addImage(Generation, "newer", "tok-newer");

  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);

    const first = await fetch(`${app.base}/gallery`, { headers: { cookie } });
    const firstHtml = await first.text();
    assert.match(firstHtml, /tok-newer/);
    assert.equal(firstHtml.includes("tok-older"), false);
    assert.match(firstHtml, /Page 1 of 2/);

    const second = await fetch(`${app.base}/gallery/page/2`, {
      headers: { cookie },
    });
    const secondHtml = await second.text();
    assert.equal(second.status, 200);
    assert.match(secondHtml, /tok-older/);
    assert.match(secondHtml, /Page 2 of 2/);

    const far = await fetch(`${app.base}/gallery/page/99`, { headers: { cookie } });
    assert.equal(far.status, 200);
    assert.match(await far.text(), /Page 2 of 2/);
  } finally {
    app.stop();
    db.close();
  }
});

test("an empty gallery says so", async () => {
  const db = freshDb();
  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const res = await fetch(`${app.base}/gallery`, { headers: { cookie } });
    assert.equal(res.status, 200);
    assert.match(await res.text(), /No shared images yet\./);
  } finally {
    app.stop();
    db.close();
  }
});

test("the gallery shows how many images it has", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  addImage(Generation, "first", "tok-count-1");
  addImage(Generation, "second", "tok-count-2");

  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/gallery`, { headers: { cookie } })
    ).text();
    assert.match(html, /2 images/);
  } finally {
    app.stop();
    db.close();
  }
});

test("a gallery tile carries no prompt, model or date", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const Settings = require("../../models/settings")(db);
  Settings.update({ public_share: 1, public_gallery: 1 });
  Generation.add({
    filename: galleryFile,
    prompt: "a secret prompt nobody should see on the tile",
    model: "gpt-tile-model",
    size: "1024x1024",
  });
  const created = Generation.all()[0];
  Generation.setShareToken(created.id, "tok-privacy");

  const app = await startApp({ db });
  try {
    const html = await (await fetch(`${app.base}/gallery`)).text();
    assert.match(html, /href="\/s\/tok-privacy"/);
    assert.equal(
      html.includes("a secret prompt nobody should see on the tile"),
      false
    );
    assert.equal(html.includes("gpt-tile-model"), false);
    assert.equal(html.includes(created.created_at.slice(0, 10)), false);
  } finally {
    app.stop();
    db.close();
  }
});

test("the dashboard sidebar links to the gallery", async () => {
  const db = freshDb();
  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const res = await fetch(`${app.base}/generations`, { headers: { cookie } });
    assert.match(await res.text(), /href="\/gallery"/);
  } finally {
    app.stop();
    db.close();
  }
});

test("the share page offers a copy prompt button when there is a prompt", async () => {
  const db = freshDb();
  addImage(buildGeneration(db), "a copyable cat", "tok-copy");
  const app = await startApp({ db });
  try {
    const html = await (await fetch(`${app.base}/s/tok-copy`)).text();
    assert.match(html, /data-copy-prompt/);
    assert.match(html, /data-prompt="a copyable cat"/);
    assert.match(html, /\/js\/share-page\.js/);
  } finally {
    app.stop();
    db.close();
  }
});

test("a share page with no prompt has no copy button", async () => {
  const db = freshDb();
  addImage(buildGeneration(db), "", "tok-nocopy");
  const app = await startApp({ db });
  try {
    const html = await (await fetch(`${app.base}/s/tok-nocopy`)).text();
    assert.equal(html.includes("data-copy-prompt"), false);
  } finally {
    app.stop();
    db.close();
  }
});

test("gallery tiles carry the slug when the setting is on", async () => {
  const db = freshDb();
  const Settings = require("../../models/settings")(db);
  addImage(buildGeneration(db), "A blue sky", "toktile123");
  Settings.update({
    public_share: 1,
    public_gallery: 1,
    public_share_slug: 1,
  });

  const app = await startApp({ db });
  try {
    const html = await (await fetch(`${app.base}/gallery`)).text();
    assert.match(html, /href="\/s\/a-blue-sky-toktile123"/);
    assert.match(html, /src="\/i\/a-blue-sky-toktile123\.png"/);
  } finally {
    app.stop();
    db.close();
  }
});

test("a shared image page offers a way back for a logged in visitor", async () => {
  const db = freshDb();
  addImage(buildGeneration(db), "a shared cat", "tok-back");
  const app = await startApp({ db });
  try {
    const anon = await (await fetch(`${app.base}/s/tok-back`)).text();
    assert.equal(anon.includes("fa-gauge-high"), false);
    assert.equal(anon.includes("Log out"), false);

    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/s/tok-back`, { headers: { cookie } })
    ).text();
    assert.match(html, /fa-gauge-high/);
    assert.match(html, /Dashboard/);
    assert.match(html, /href="\/"/);
  } finally {
    app.stop();
    db.close();
  }
});

test("the gallery pager uses built links and carries no criteria", async () => {
  const db = freshDb();
  const Generation = buildGeneration(db);
  const Settings = require("../../models/settings")(db);
  Settings.update({ public_share: 1, public_gallery: 1, page_size: "1" });

  for (let i = 0; i < 3; i += 1) {
    Generation.add({ filename: `g${i}.png`, prompt: "a cat", size: "" });
    Generation.setShareToken(Generation.all()[0].id, `tokpage${i}`);
  }

  const app = await startApp({ db });
  try {
    const html = await (await fetch(`${app.base}/gallery`)).text();
    assert.match(html, /href="\/gallery\/page\/2"/);
    const probed = await (await fetch(`${app.base}/gallery?evil=1`)).text();
    assert.equal(probed.includes("evil"), false);
  } finally {
    app.stop();
    db.close();
  }
});
