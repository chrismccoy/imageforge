/**
 * The public pages' own shell
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";
process.env.PUBLIC_SHARE = "true";
process.env.PUBLIC_GALLERY = "true";
process.env.PUBLIC_COLLECTIONS = "true";
process.env.PUBLIC_FAVOURITES = "true";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const ejs = require("ejs");
const { attrTag } = require("../helpers/dom");
const { startApp, freshDb, uploadFixture } = require("../helpers/app");
const { buildModels } = require("../../models");
const { PAGES } = require("../../config/urls");
const { DEFAULT_BRAND_NAME, DEFAULT_BRAND_ICON } = require("../../config/brand");

const BRAND = {
  name: DEFAULT_BRAND_NAME,
  icon: DEFAULT_BRAND_ICON,
  mark: true,
};

const BRANDED_HEADER = /<header class="pub-header(-sticky)?"/;

const VIEWS_DIR = path.join(__dirname, "..", "..", "views");

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2190}-\u{2BFF}]/u;

function mainLandmarkCount(html) {
  return (html.match(/<main\b/g) || []).length;
}

function renderView(name, locals = {}) {
  return ejs.render(
    `<%- include('${name}') %>`,
    { pages: PAGES, brand: BRAND, ...locals },
    {
      filename: path.join(VIEWS_DIR, "_publicShellViewTest.ejs"),
    }
  );
}

function renderShell({ canManage = false, title = "A shared image" } = {}) {
  const template = `
<%- include('partials/head') %>
  <%- include('partials/public/header') %>
  <h1><%= title %></h1>
  <p>content goes here</p>
  <%- include('partials/public/foot') %>
<%- include('partials/foot') %>
`;
  return ejs.render(
    template,
    { title, canManage, pages: PAGES, brand: BRAND },
    { filename: path.join(VIEWS_DIR, "_publicShellTest.ejs") }
  );
}

function header(html) {
  const match = /<header[\s\S]*?<\/header>/.exec(html);
  assert.ok(match, "no <header> in the rendered shell");
  return match[0];
}

function footer(html) {
  const match = /<footer[\s\S]*?<\/footer>/.exec(html);
  assert.ok(match, "no <footer> in the rendered shell");
  return match[0];
}

test("a public page renders the branded header and the footer line", () => {
  const html = renderShell();
  assert.match(header(html), /Image Forge/, "the header should carry the brand");
  assert.match(
    footer(html),
    /Made with Image Forge/,
    "the footer should carry its line"
  );
});

test("a visitor who is not signed in sees no dashboard link or owner chip", () => {
  const bar = header(renderShell({ canManage: false }));
  assert.equal(
    attrTag(bar, "owner-only", "span"),
    null,
    "no owner chip for a stranger"
  );
  assert.equal(
    attrTag(bar, "btn-quiet", "a"),
    null,
    "no dashboard link for a stranger"
  );
});

test("the owner, signed in, sees both the owner chip and the dashboard link", () => {
  const bar = header(renderShell({ canManage: true }));

  const chip = attrTag(bar, "owner-only", "span");
  assert.ok(chip, "the owner should see the owner chip");
  assert.match(chip, /You are signed in/);

  const dashboardLink = attrTag(bar, "btn-quiet", "a");
  assert.ok(dashboardLink, "the owner should see the dashboard link");
  assert.match(dashboardLink, /href="\/"/);
  assert.match(dashboardLink, /Dashboard/);
});

test("a public page never renders the app's own sidebar", () => {
  assert.doesNotMatch(renderShell({ canManage: true }), /<aside/);
  assert.doesNotMatch(renderShell({ canManage: false }), /<aside/);
});


test("denied.ejs shows its icon and names the allow list, with no branded header and no way onward", () => {
  const html = renderView("denied", { title: "Access denied" });
  assert.match(html, /fa-shield-halved/, "no shield icon");
  const h1 = /<h1[^>]*>[\s\S]*?<\/h1>/.exec(html);
  assert.ok(h1, "no heading");
  assert.match(h1[0], /Access denied/);
  assert.match(html, /allow list/i, "should name the allow list as the reason");
  assert.doesNotMatch(html, /<header/, "denied should carry no branded header");
  assert.doesNotMatch(html, /<a\s/, "denied should offer no way onward");
  assert.doesNotMatch(html, EMOJI);
});

test("error.ejs shows its icon and its sentence inside the branded header", () => {
  const html = renderView("error", {
    title: "Something went wrong",
    canManage: false,
  });
  assert.match(html, /fa-circle-exclamation/, "no exclamation icon");
  const h1 = /<h1[^>]*>[\s\S]*?<\/h1>/.exec(html);
  assert.ok(h1, "no heading");
  assert.match(h1[0], /Something went wrong/);
  assert.match(
    html,
    BRANDED_HEADER,
    "error should carry the branded header"
  );
  assert.doesNotMatch(html, EMOJI);
});

test("error.ejs offers the way back only to the owner", () => {
  const owner = renderView("error", {
    title: "Something went wrong",
    canManage: true,
  });
  const link = attrTag(owner, "href", "a");
  assert.ok(link, "the owner should be offered a way onward");
  assert.match(link, /href="\/"/);
  assert.match(link, /dashboard/i);
});

test("share-notfound.ejs says the link is gone and why, with no way onward", () => {
  const html = renderView("share-notfound", {
    title: "Not found",
    noindex: true,
    canManage: false,
  });
  assert.match(html, /fa-link-slash/, "no broken-link icon");
  const h1 = /<h1[^>]*>[\s\S]*?<\/h1>/.exec(html);
  assert.ok(h1, "no heading");
  assert.match(h1[0], /This link is no longer available/);
  assert.match(html, /revoked/i, "should note the link may have been revoked");
  assert.match(html, /mistyped/i, "should note the address may be mistyped");
  assert.match(
    html,
    BRANDED_HEADER,
    "share-notfound should carry the branded header"
  );
  assert.doesNotMatch(html, /<a\s/, "share-notfound should offer no way onward");
  assert.doesNotMatch(html, EMOJI);
});

test("each of the three small state pages has exactly one main landmark", () => {
  assert.equal(
    mainLandmarkCount(renderView("denied", { title: "Access denied" })),
    1,
    "denied.ejs should open its own <main>"
  );
  assert.equal(
    mainLandmarkCount(
      renderView("error", { title: "Something went wrong", canManage: false })
    ),
    1,
    "error.ejs should have exactly one <main>, from partials/public/header"
  );
  assert.equal(
    mainLandmarkCount(
      renderView("share-notfound", {
        title: "Not found",
        noindex: true,
        canManage: false,
      })
    ),
    1,
    "share-notfound.ejs should have exactly one <main>, from partials/public/header"
  );
});

test("login.ejs draws no emoji either", () => {
  const html = renderView("login", {
    title: "Log in",
    error: null,
    csrfToken: "tok",
    canManage: false,
  });
  assert.doesNotMatch(html, EMOJI);
});


function seededDb() {
  const db = freshDb();
  const { Generation, Collection, Settings, ModelPrice } = buildModels(db);
  const now = new Date().toISOString();

  ModelPrice.set("gpt-image-2", 5, 40, now);

  const usage = { total: 1200, input: 200, output: 1000 };

  const sharedId = Number(
    Generation.add({
      filename: "sunset.png",
      prompt: "a sunset over the sea",
      model: "gpt-image-2",
      size: "1024x1024",
      usage,
    })
  );
  Generation.setShareToken(sharedId, "SWEEPSHARE01");

  const collectionId = Collection.add("Client work", now);
  const collectionImageId = Number(
    Generation.add({
      filename: "campaign.png",
      prompt: "a spring campaign banner",
      model: "gpt-image-2",
      size: "1024x1024",
      usage,
    })
  );
  Collection.addImage(collectionImageId, collectionId);
  const collectionToken = Collection.share(
    collectionId,
    "Spring campaign",
    () => "SWEEPCOLLECT1"
  );

  const favImageId = Number(
    Generation.add({
      filename: "lighthouse.png",
      prompt: "a starred lighthouse",
      model: "gpt-image-2",
      size: "1024x1024",
      usage,
    })
  );
  Generation.toggleFavorite(favImageId);
  Settings.update({ public_favourites: 1 });
  const favouritesToken = Settings.shareFavourites(() => "SWEEPFAVS001");

  return {
    db,
    sharedToken: "SWEEPSHARE01",
    collectionToken,
    collectionImageId,
    favouritesToken,
    favImageId,
  };
}

test("no public page draws an emoji", async () => {
  const {
    db,
    sharedToken,
    collectionToken,
    collectionImageId,
    favouritesToken,
    favImageId,
  } = seededDb();

  const app = await startApp({ db });
  try {
    for (const path of [
      "/login",
      "/gallery",
      `/s/${sharedToken}`,
      `/c/${collectionToken}`,
      `/c/${collectionToken}/i/${collectionImageId}`,
      `/f/${favouritesToken}`,
      `/f/${favouritesToken}/i/${favImageId}`,
      "/s/nope",
    ]) {
      const res = await fetch(`${app.base}${path}`);
      const html = await res.text();
      assert.doesNotMatch(html, EMOJI, path);
    }
  } finally {
    app.stop();
    db.close();
  }
});

test("the seeded fixture renders the populated branch of every public page", async () => {
  const {
    db,
    sharedToken,
    collectionToken,
    collectionImageId,
    favouritesToken,
    favImageId,
  } = seededDb();

  const app = await startApp({ db });
  try {
    const gallery = await (await fetch(`${app.base}/gallery`)).text();
    assert.match(
      gallery,
      /href="\/s\/SWEEPSHARE01"/,
      "gallery should tile the shared image"
    );

    const shared = await (await fetch(`${app.base}/s/${sharedToken}`)).text();
    assert.match(shared, /a sunset over the sea/);
    assert.match(shared, /gpt-image-2/);
    assert.match(shared, /1024x1024/);
    assert.match(shared, /\$\d/, "the share page should show a cost");

    const collection = await (
      await fetch(`${app.base}/c/${collectionToken}`)
    ).text();
    assert.match(
      collection,
      /Spring campaign/,
      "the public title, not the private name"
    );
    assert.equal(
      collection.includes("Client work"),
      false,
      "never the private name"
    );
    assert.match(
      collection,
      new RegExp(`/c/${collectionToken}/i/${collectionImageId}`)
    );

    const collectionImage = await (
      await fetch(`${app.base}/c/${collectionToken}/i/${collectionImageId}`)
    ).text();
    assert.match(collectionImage, /a spring campaign banner/);
    assert.match(collectionImage, /gpt-image-2/);
    assert.match(collectionImage, /1024x1024/);
    assert.match(
      collectionImage,
      /\$\d/,
      "the collection image should show a cost"
    );

    const favourites = await (
      await fetch(`${app.base}/f/${favouritesToken}`)
    ).text();
    assert.match(favourites, /1 image/);
    assert.match(favourites, new RegExp(`/f/${favouritesToken}/i/${favImageId}`));

    const favouriteImage = await (
      await fetch(`${app.base}/f/${favouritesToken}/i/${favImageId}`)
    ).text();
    assert.match(favouriteImage, /a starred lighthouse/);
    assert.match(favouriteImage, /gpt-image-2/);
    assert.match(favouriteImage, /1024x1024/);
    assert.match(favouriteImage, /\$\d/, "the favourite image should show a cost");
  } finally {
    app.stop();
    db.close();
  }
});

test("the login page carries no maker's mark, and still closes its main", async () => {
  const app = await startApp({ db: freshDb() });
  try {
    const html = await (await fetch(`${app.base}/login`)).text();

    assert.doesNotMatch(html, /Made with Image Forge/);
    assert.equal((html.match(/<main/g) || []).length, 1);
    assert.equal((html.match(/<\/main>/g) || []).length, 1);
  } finally {
    app.stop();
  }
});

test("a shared page still carries the maker's mark", async () => {
  const db = freshDb();
  const { Generation, Settings } = buildModels(db);
  Settings.update({ public_share: 1 });
  const file = uploadFixture("markcheck");
  const id = Number(
    Generation.add({
      filename: file.filename,
      prompt: "a cat",
      model: "gpt-image-1.5",
      size: "1024x1024",
    })
  );
  Generation.setShareToken(id, "MARKTOKEN1");

  const app = await startApp({ db });
  try {
    const html = await (await fetch(`${app.base}/s/MARKTOKEN1`)).text();
    assert.match(html, /Made with Image Forge/);
  } finally {
    app.stop();
    file.remove();
    db.close();
  }
});

test("the error page carries no maker's mark, and still closes its main", async () => {
  const html = await ejs.renderFile(path.join(VIEWS_DIR, "error.ejs"), {
    title: "Something went wrong",
    active: "",
    canManage: false,
    csrfToken: "t",
    navLinks: [],
    navGroups: [],
    adminUser: "admin",
    brand: BRAND,
    filename: null,
  });

  assert.doesNotMatch(html, /Made with Image Forge/);
  assert.equal((html.match(/<main/g) || []).length, 1);
  assert.equal((html.match(/<\/main>/g) || []).length, 1);
});

test("the link-gone page carries no maker's mark, and still closes its main", async () => {
  const html = await ejs.renderFile(path.join(VIEWS_DIR, "share-notfound.ejs"), {
    title: "This link is no longer available",
    active: "",
    canManage: false,
    csrfToken: "t",
    navLinks: [],
    navGroups: [],
    adminUser: "admin",
    brand: BRAND,
  });

  assert.doesNotMatch(html, /Made with Image Forge/);
  assert.equal((html.match(/<main/g) || []).length, 1);
  assert.equal((html.match(/<\/main>/g) || []).length, 1);
});

test("the error page offers the dashboard only to the owner", async () => {
  const locals = {
    title: "Something went wrong",
    active: "",
    csrfToken: "t",
    navLinks: [],
    navGroups: [],
    adminUser: "admin",
    brand: BRAND,
    pages: PAGES,
  };
  const file = path.join(VIEWS_DIR, "error.ejs");

  const stranger = await ejs.renderFile(file, { ...locals, canManage: false });
  const owner = await ejs.renderFile(file, { ...locals, canManage: true });

  assert.doesNotMatch(stranger, /Back to the dashboard/);
  assert.match(owner, /Back to the dashboard/);
  assert.match(stranger, /Something went wrong/);
});

test("the error page renders with no canManage local at all", async () => {
  const html = await ejs.renderFile(path.join(VIEWS_DIR, "error.ejs"), {
    title: "Something went wrong",
    active: "",
    csrfToken: "t",
    navLinks: [],
    navGroups: [],
    adminUser: "admin",
    brand: BRAND,
  });

  assert.match(html, /Something went wrong/);
  assert.doesNotMatch(html, /Back to the dashboard/);
});
