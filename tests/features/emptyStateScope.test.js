/**
 * Empty-state scope tests
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
const path = require("path");

const { freshDb, startApp, signIn } = require("../helpers/app");

const CSS = path.join(__dirname, "..", "..", "public", "css", "app.css");

function emptyBlock(html) {
  const match = /<div class="empty[^"]*"[^>]*>[\s\S]*?<\/div>/.exec(html);
  return match ? match[0] : null;
}

test("the built stylesheet scopes the empty-state icon and paragraph to .pub-main", () => {
  const css = fs.readFileSync(CSS, "utf8");

  assert.ok(css.includes(".pub-main .empty i{"), ".pub-main .empty i is not built");
  assert.ok(css.includes(".pub-main .empty p{"), ".pub-main .empty p is not built");

  assert.equal(
    /(?<!\.pub-main )\.empty i\{/.test(css),
    false,
    "an unscoped .empty i rule is back"
  );
  assert.equal(
    /(?<!\.pub-main )\.empty p\{/.test(css),
    false,
    "an unscoped .empty p rule is back"
  );
});

test("a logged-in empty state (trash) keeps its own icon and text sizing", async () => {
  const db = freshDb();
  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/trash`, { headers: { cookie } })
    ).text();

    const block = emptyBlock(html);
    assert.ok(block, "no .empty block found on the trash page");
    assert.match(
      block,
      /<i class="fa-regular fa-trash-can text-5xl text-slate-300"/
    );
    assert.match(block, /<p class="mt-3 text-sm text-slate-500">/);
  } finally {
    app.stop();
    db.close();
  }
});

test("the public gallery's empty state renders inside .pub-main with no size override of its own", async () => {
  const db = freshDb();
  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/gallery`, { headers: { cookie } })
    ).text();

    assert.ok(
      html.indexOf('<main class="pub-main">') !== -1 &&
        html.indexOf('<main class="pub-main">') <
          html.indexOf("No shared images yet."),
      "the gallery's empty state is not inside .pub-main"
    );

    const block = emptyBlock(html);
    assert.ok(block, "no .empty block found on the gallery page");
    assert.match(block, /<i class="fa-regular fa-images" aria-hidden="true">/);
    assert.match(block, /<p>No shared images yet\.<\/p>/);
  } finally {
    app.stop();
    db.close();
  }
});
