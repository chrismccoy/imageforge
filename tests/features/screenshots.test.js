/**
 * Screenshot gallery tests
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "203.0.113.9";
process.env.TRUST_PROXY = "";

const test = require("node:test");
const assert = require("node:assert/strict");

const { startApp, freshDb } = require("../helpers/app");

test("the gallery page is served without a login", async () => {
  const app = await startApp({ db: freshDb() });
  try {
    const res = await fetch(`${app.base}/screenshots/`, { redirect: "manual" });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") || "", /text\/html/);
    assert.match(await res.text(), /Image Forge/);
  } finally {
    app.stop();
  }
});

test("a screenshot is served without a login", async () => {
  const app = await startApp({ db: freshDb() });
  try {
    const res = await fetch(`${app.base}/screenshots/01-dashboard.jpg`, {
      redirect: "manual",
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") || "", /image\/jpeg/);
  } finally {
    app.stop();
  }
});

test("a gated route refuses the caller the screenshots are served to", async () => {
  const app = await startApp({ db: freshDb() });
  try {
    const res = await fetch(`${app.base}/settings`, { redirect: "manual" });
    assert.notEqual(res.status, 200);
  } finally {
    app.stop();
  }
});

test("the mount serves nothing above its own directory", async () => {
  const app = await startApp({ db: freshDb() });
  try {
    const res = await fetch(`${app.base}/screenshots/../package.json`, {
      redirect: "manual",
    });
    assert.notEqual(res.status, 200);
  } finally {
    app.stop();
  }
});

test("the gallery asks not to be indexed", async () => {
  const app = await startApp({ db: freshDb() });
  try {
    const res = await fetch(`${app.base}/screenshots/`, { redirect: "manual" });
    assert.match(res.headers.get("x-robots-tag") || "", /noindex/);
  } finally {
    app.stop();
  }
});

test("the gallery's stylesheet is served with it", async () => {
  const app = await startApp({ db: freshDb() });
  try {
    const res = await fetch(`${app.base}/screenshots/gallery.css`, {
      redirect: "manual",
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") || "", /text\/css/);
    const css = await res.text();
    assert.match(css, /\.shadow-bento-sm/);
    assert.match(css, /\.rounded-pill/);
    assert.match(css, /\[hidden\]\{display:none!important\}/);
  } finally {
    app.stop();
  }
});

test("the gallery asks no other host to draw it", async () => {
  const app = await startApp({ db: freshDb() });
  try {
    const html = await (await fetch(`${app.base}/screenshots/`)).text();
    assert.match(html, /href="gallery\.css"/);
    assert.doesNotMatch(html, /https?:\/\/(cdn|cdnjs|fonts|use|unpkg)\./);
  } finally {
    app.stop();
  }
});

test("the gallery's lightbox is a file, not an inline script", async () => {
  const app = await startApp({ db: freshDb() });
  try {
    const html = await (await fetch(`${app.base}/screenshots/`)).text();
    assert.match(html, /<script src="gallery\.js"><\/script>/);
    assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)[^>]*>/);

    const res = await fetch(`${app.base}/screenshots/gallery.js`, {
      redirect: "manual",
    });
    assert.equal(res.status, 200);
    assert.match(await res.text(), /lightbox/);
  } finally {
    app.stop();
  }
});

test("the gallery loads nothing by an absolute path", async () => {
  const app = await startApp({ db: freshDb() });
  try {
    const html = await (await fetch(`${app.base}/screenshots/`)).text();

    const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(refs.length > 0);
    for (const ref of refs) {
      assert.doesNotMatch(ref, /^\//, `${ref} is root relative`);
      assert.doesNotMatch(ref, /^https?:/, `${ref} is on another host`);
    }
  } finally {
    app.stop();
  }
});

test("every control carries a drawn icon", async () => {
  const app = await startApp({ db: freshDb() });
  try {
    const html = await (await fetch(`${app.base}/screenshots/`)).text();

    for (const id of ["lb-save", "lb-close", "lb-prev", "lb-next"]) {
      const button = html.slice(html.indexOf(`id="${id}"`));
      const end = button.search(/<\/(?:a|button)>/);
      assert.match(button.slice(0, end), /<svg /, `#${id} has no icon`);
    }

    assert.equal((html.match(/<svg /g) || []).length, 18 + 4 + 1);
  } finally {
    app.stop();
  }
});

test("every shot carries what the lightbox shows", async () => {
  const app = await startApp({ db: freshDb() });
  try {
    const html = await (await fetch(`${app.base}/screenshots/`)).text();

    const figures = html.match(/<figure[^>]*data-shot[^>]*>/g) || [];
    assert.equal(figures.length, 18);
    for (const figure of figures) {
      assert.match(figure, /data-title="[^"]+"/, figure);
      assert.match(figure, /data-text="[^"]+"/, figure);
    }

    for (const id of [
      "lightbox",
      "lb-image",
      "lb-counter",
      "lb-title",
      "lb-caption",
      "lb-save",
      "lb-strip",
      "lb-close",
      "lb-prev",
      "lb-next",
    ]) {
      assert.match(html, new RegExp(`id="${id}"`), `#${id} is missing`);
    }
  } finally {
    app.stop();
  }
});

test("the lightbox starts hidden", async () => {
  const app = await startApp({ db: freshDb() });
  try {
    const html = await (await fetch(`${app.base}/screenshots/`)).text();
    assert.match(html, /<div id="lightbox" hidden/);
  } finally {
    app.stop();
  }
});

test("the header carries the app's mark", async () => {
  const app = await startApp({ db: freshDb() });
  try {
    const html = await (await fetch(`${app.base}/screenshots/`)).text();
    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));

    assert.match(header, /from-brand-500/);
    assert.match(header, /to-brand-700/);
    assert.match(header, /rounded-xl/);
    assert.match(header, /<svg /);

    const css = await (await fetch(`${app.base}/screenshots/gallery.css`)).text();
    assert.match(css, /--tw-gradient-from:\s*#6366f1/);
  } finally {
    app.stop();
  }
});
