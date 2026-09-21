/**
 * Dashboard tests
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";

const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const schema = require("../../db/schema");
const { createApp } = require("../../server");
const { dataWidget } = require("../helpers/dom");

const NOW = "2026-08-10T10:00:00.000Z";

function freshDb() {
  const db = new Database(":memory:");
  schema.init(db);
  return db;
}

function models(db) {
  return require("../../models").buildModels(db);
}

function anImage(db, prompt, extra = {}) {
  return Number(
    models(db).Generation.add(
      Object.assign(
        {
          filename: prompt.replace(/\s/g, "-") + ".png",
          prompt,
          model: "gpt-image-2",
          size: "1024x1024",
        },
        extra
      )
    )
  );
}

async function startApp(db) {
  const app = createApp({ db });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    stop: () => server.close(),
  };
}

function cookieFrom(res) {
  const set = res.headers.getSetCookie();
  return set && set.length ? set.map((c) => c.split(";")[0]).join("; ") : null;
}

async function dashboardHtml(seed) {
  const db = freshDb();
  (seed || ((d) => anImage(d, "a cat")))(db);
  const app = await startApp(db);
  const cookie = await signIn(app.base);
  const html = await (await fetch(`${app.base}/`, { headers: { cookie } })).text();
  return { html, stop: app.stop, db };
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
  return cookieFrom(res) || loginCookie;
}

test("the front page is the dashboard, not the generate form", async () => {
  const { html, stop, db } = await dashboardHtml();
  try {
    assert.match(html, /<h1[^>]*>\s*Dashboard/);
    assert.equal(/id="generate-btn"/.test(html), false);
    assert.equal(/id="prompt-select"/.test(html), false);
  } finally {
    stop();
    db.close();
  }
});

test("generate has moved to its own path and still works", async () => {
  const db = freshDb();
  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const res = await fetch(`${app.base}/generate`, { headers: { cookie } });
    const html = await res.text();

    assert.equal(res.status, 200);
    assert.match(html, /id="generate-btn"/);
    assert.match(html, /id="prompt-select"/);
    assert.match(html, /data-model-strip/);
  } finally {
    app.stop();
    db.close();
  }
});

test("the old usage path still lands somewhere useful", async () => {
  const db = freshDb();
  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const res = await fetch(`${app.base}/stats`, {
      headers: { cookie },
      redirect: "manual",
    });

    assert.ok([200, 301, 302].includes(res.status));
  } finally {
    app.stop();
    db.close();
  }
});

test("nothing still points at / meaning Generate", async () => {
  const db = freshDb();
  anImage(db, "a cat");

  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);

    for (const path of ["/generations", "/generations?fav=1"]) {
      const html = await (
        await fetch(`${app.base}${path}`, { headers: { cookie } })
      ).text();
      const cta =
        /<a href="([^"]*)"[^>]*>\s*(?:\+ New generation|Generate your first image)/.exec(
          html
        );
      if (cta) {
        assert.equal(cta[1], "/generate", `${path} sends you to the right place`);
      }
    }
  } finally {
    app.stop();
    db.close();
  }
});

test("the sidebar leads with Dashboard, then Generate", async () => {
  const db = freshDb();
  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/`, { headers: { cookie } })
    ).text();

    const nav = /<nav[\s\S]*?<\/nav>/.exec(html)[0];
    const dashboardLink = /<a href="\/"[^>]*>[\s\S]*?<\/a>/.exec(nav)[0];
    assert.match(dashboardLink, /Dashboard/);
    assert.match(nav, /<a href="\/generate"/);
    const sidebar = /<aside[\s\S]*?<\/aside>/.exec(html)[0];
    const lit = [
      ...sidebar.matchAll(/<a href="([^"]+)"[^>]*class="[^"]*bg-brand-600/g),
    ].map((m) => m[1]);
    assert.deepEqual(lit, ["/"]);
  } finally {
    app.stop();
    db.close();
  }
});

test("the dashboard shows widgets built from real numbers", async () => {
  const db = freshDb();
  const { Prompt, Collection } = models(db);
  const promptId = Prompt.add("Sunsets", "a sunset");
  Collection.add("Client work", NOW);

  anImage(db, "a golden sunset", {
    prompt_id: promptId,
    usage: { total: 1200, input: 200, output: 1000 },
  });
  anImage(db, "a cat");

  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/`, { headers: { cookie } })
    ).text();

    assert.match(html, /Images/);
    assert.match(html, /Storage/);
    assert.match(html, /Prompts/);
    assert.match(html, /Collections/);
    assert.match(dataWidget(html, "images", "section"), /2/);
    assert.match(dataWidget(html, "prompts", "dd"), /1/);
    assert.match(html, /Recent/i);
    assert.match(html, /a golden sunset/);
    assert.match(html, /data-widget="favourites"/);
    assert.match(html, /data-widget="top-rated"/);
    assert.match(html, /data-widget="most-used"/);
    assert.match(html, /data-widget="spend"/);
  } finally {
    app.stop();
    db.close();
  }
});

test("the widgets show what they are about", async () => {
  const db = freshDb();
  const { Prompt, Generation } = models(db);
  const loved = Prompt.add("Beloved", "a sunset");
  const meh = Prompt.add("Passable", "a cat");
  Prompt.setRating(loved, 5);
  Prompt.setRating(meh, 2);

  const starred = anImage(db, "a starred image", { prompt_id: loved });
  Generation.toggleFavorite(starred);
  anImage(db, "an ordinary image", { prompt_id: loved });

  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/`, { headers: { cookie } })
    ).text();

    const widget = (name) => {
      const found = new RegExp(`data-widget="${name}"[\\s\\S]*?<\\/section>`).exec(
        html
      );
      assert.ok(found, `the ${name} widget is on the page`);
      return found[0];
    };

    const rated = widget("top-rated");
    assert.ok(
      rated.indexOf("Beloved") < rated.indexOf("Passable"),
      "top rated is sorted by rating"
    );

    assert.match(widget("favourites"), /a starred image/);
    assert.equal(
      /an ordinary image/.test(widget("favourites")),
      false,
      "and only favourites"
    );

    assert.match(widget("most-used"), /Beloved/);
  } finally {
    app.stop();
    db.close();
  }
});

test("an empty install still renders a dashboard", async () => {
  const db = freshDb();
  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const res = await fetch(`${app.base}/`, { headers: { cookie } });
    const html = await res.text();

    assert.equal(res.status, 200);
    assert.match(html, /Dashboard/);
    assert.match(html, /href="\/generate"/);
  } finally {
    app.stop();
    db.close();
  }
});

test("a model whose images never recorded tokens shows a dash, not a zero", async () => {
  const db = freshDb();
  anImage(db, "an uncounted image");

  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/`, { headers: { cookie } })
    ).text();
    const byModel = dataWidget(html, "by-model", "section");

    assert.match(
      byModel,
      /<td[^>]*>\s*—\s*<\/td>\s*<\/tr>/,
      "an em dash in the Cost column says nothing was recorded"
    );
    assert.equal(/\$0\.00/.test(byModel), false, "no zero cost");
  } finally {
    app.stop();
    db.close();
  }
});

test("each figure carries its own icon", async () => {
  const { html, stop, db } = await dashboardHtml();
  try {
    const widget = (name) =>
      new RegExp(`data-widget="${name}"[\\s\\S]*?</section>`).exec(html)[0];

    assert.match(widget("images"), /fa-regular fa-images/);
    assert.match(widget("spend"), /fa-solid fa-dollar-sign/);
    assert.match(widget("storage"), /fa-solid fa-hard-drive/);
    assert.match(widget("favourites"), /fa-solid fa-star/);
  } finally {
    stop();
    db.close();
  }
});

test("the week's images are shown as a rise", async () => {
  const { html, stop, db } = await dashboardHtml();
  try {
    const images = /data-widget="images"[\s\S]*?<\/section>/.exec(html)[0];
    assert.match(images, /fa-arrow-trend-up/);
  } finally {
    stop();
    db.close();
  }
});

test("the dashboard lists the biggest collections", async () => {
  const db = freshDb();
  const { Collection, Generation } = models(db);
  const winter = Collection.add("Winter campaign", new Date().toISOString());
  const id = Number(
    Generation.add({
      filename: `${process.pid}-cw.png`,
      prompt: "a cat",
      model: "gpt-image-1.5",
      size: "1024x1024",
    })
  );
  Collection.addImage(id, winter);
  Collection.share(winter, "Winter 2026", () => "DASHTOK001");

  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/`, { headers: { cookie } })
    ).text();

    const widget = dataWidget(html, "collections-widget", "section");
    assert.match(widget, /Winter campaign/, "its own name, this side of the login");
    assert.match(widget, /fa-share-nodes/, "and a mark saying it is shared");
  } finally {
    app.stop();
    db.close();
  }
});

test("the collections widget says so when there are none", async () => {
  const db = freshDb();
  anImage(db, "a cat");

  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/`, { headers: { cookie } })
    ).text();

    const widget = dataWidget(html, "collections-widget", "section");
    assert.match(widget, /No collections yet/);
  } finally {
    app.stop();
    db.close();
  }
});

test("the trash is counted in the library widget", async () => {
  const db = freshDb();
  const { Generation } = models(db);
  const id = Number(
    Generation.add({
      filename: `${process.pid}-lt.png`,
      prompt: "a cat",
      model: "gpt-image-1.5",
      size: "1024x1024",
    })
  );
  Generation.trash(id);

  const app = await startApp(db);
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/`, { headers: { cookie } })
    ).text();

    const widget = dataWidget(html, "library", "section");
    assert.match(widget, /In trash/);
    assert.match(dataWidget(html, "trash", "dd"), /1/);
  } finally {
    app.stop();
    db.close();
  }
});

test("uploads are labelled without brackets in By model", async () => {
  const { html, stop, db } = await dashboardHtml((d) => {
    anImage(d, "a cat");
    anImage(d, "a scan", { model: null });
  });
  try {
    const widget = dataWidget(html, "by-model", "section");
    assert.match(widget, />\s*uploaded\s*</);
    assert.doesNotMatch(widget, /\(uploaded\)/);
  } finally {
    stop();
    db.close();
  }
});

test("By model spaces its icon off its label", async () => {
  const { html, stop, db } = await dashboardHtml((d) => {
    anImage(d, "a cat");
    anImage(d, "a scan", { model: null });
  });
  try {
    const widget = dataWidget(html, "by-model", "section");
    const cells = widget.match(/<td[^>]*>[\s\S]*?<\/td>/g) || [];
    const labelled = cells.filter((cell) => /<i /.test(cell));

    assert.equal(labelled.length, 2);
    for (const cell of labelled) {
      assert.match(cell, /flex items-center gap-3/, cell);
      assert.match(cell, /w-4 text-center/, cell);
    }
  } finally {
    stop();
    db.close();
  }
});
