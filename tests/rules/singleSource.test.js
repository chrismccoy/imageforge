/**
 * Lists that have to agree
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { MODEL_TOKENS } = require("../../config/images");
const { NAV_LINKS } = require("../../config/navigation");
const { PAGES } = require("../../config/urls");
const { COMPARE_IMAGES } = require("../../routes/apiCost");
const { SERVABLE, extMatches } = require("../../utils/domain/imageExt");
const { ACCEPTED_EXT } = require("../../utils/files/imageType");
const { LINK_KEYS } = require("../../utils/http/pageLink");
const {
  CARRIED: GENERATION_FILTERS,
} = require("../../controllers/support/helpers/generationCriteria");
const {
  CARRIED: PROMPT_FILTERS,
} = require("../../controllers/support/helpers/promptLinks");

test("a compare costs one image per model the app offers", () => {
  assert.equal(
    COMPARE_IMAGES,
    MODEL_TOKENS.length,
    "routes/apiCost.js charges " +
      COMPARE_IMAGES +
      " images for a compare, but config/images.js offers " +
      MODEL_TOKENS.length +
      " models. Decide what the Generate page should do with a third model, " +
      "then update both."
  );
});

test("every accepted image format has a servable extension", () => {
  for (const ext of ACCEPTED_EXT) {
    assert.ok(
      SERVABLE.includes(ext),
      `${ext} is accepted on upload but no public URL may end in it`
    );
  }
});

test("every servable extension names a format the app accepts", () => {
  for (const claimed of SERVABLE) {
    assert.ok(
      ACCEPTED_EXT.some((own) => extMatches(`image.${own}`, claimed)),
      `a URL may claim .${claimed}, but no accepted format is stored under it`
    );
  }
});

const LIST_CONTROLLERS = [
  "controllers/support/helpers/generationCriteria.js",
  "controllers/promptsController.js",
];

function queryFieldsIn(file) {
  const source = fs.readFileSync(path.join(__dirname, "..", "..", file), "utf8");
  return [...source.matchAll(/field\(req\.query,\s*"([A-Za-z_]+)"/g)].map(
    (found) => found[1]
  );
}

test("every filter a list page reads is carried by its own links", () => {
  for (const file of LIST_CONTROLLERS) {
    for (const key of queryFieldsIn(file)) {
      assert.ok(
        LINK_KEYS.includes(key),
        `${file} reads ?${key}, but utils/http/pageLink.js drops it, so ` +
          "paging or sorting loses it"
      );
    }
  }
});

test("every key a link may carry is read by a list page", () => {
  const read = new Set(LIST_CONTROLLERS.flatMap(queryFieldsIn));
  for (const key of LINK_KEYS) {
    assert.ok(
      read.has(key),
      `utils/http/pageLink.js carries ?${key}, but no list controller reads it`
    );
  }
});

const PAGE_PATHS = Object.values(PAGES);

test("every sidebar link is built from config/urls.js", () => {
  for (const link of NAV_LINKS) {
    const path = link.href.split("?")[0];
    assert.ok(
      PAGE_PATHS.includes(path),
      `config/navigation.js links to ${link.href}, which is not a PAGES value. ` +
        "Add the page to config/urls.js and build the href from it, rather " +
        "than writing the path out a second time."
    );
  }
});

const VIEWS_DIR = path.join(__dirname, "..", "..", "views");
const SCRIPTS_PARTIAL = path.join(VIEWS_DIR, "partials", "page-scripts.ejs");

function everyView(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return everyView(full);
    return entry.name.endsWith(".ejs") ? [full] : [];
  });
}

test("only partials/page-scripts.ejs writes a script tag", () => {
  for (const view of everyView(VIEWS_DIR)) {
    if (view === SCRIPTS_PARTIAL) continue;
    assert.doesNotMatch(
      fs.readFileSync(view, "utf8"),
      /<script src=/,
      `${path.relative(VIEWS_DIR, view)} writes its own script tag. Load it ` +
        "through partials/page-scripts.ejs, so the order every browser " +
        "module depends on is stated in one place."
    );
  }
});

const ASSET_PREFIXES = ["/vendor/", "/css/", "/js/"];

const WRITTEN_PATHS = [
  /(?:href|action)="(\/[^"<%]*)"/g,
  /[`'"](\/[a-z][a-z0-9-]*)(?:\/|[`'"$])/g,
];

function codeOnly(source) {
  return source.replace(/<%#[\s\S]*?%>/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

test("no view writes a path by hand", () => {
  for (const view of everyView(VIEWS_DIR)) {
    const source = codeOnly(fs.readFileSync(view, "utf8"));

    for (const pattern of WRITTEN_PATHS) {
      for (const [, found] of source.matchAll(pattern)) {
        assert.ok(
          ASSET_PREFIXES.some((prefix) => `${found}/`.startsWith(prefix)),
          `${path.relative(VIEWS_DIR, view)} names ${found} by hand. Take the ` +
            "prefix as a local, or use pages.*, so the path is stated once in " +
            "config/urls.js."
        );
      }
    }
  }
});

const CARRIED_BY = [
  ["the generations list", GENERATION_FILTERS],
  ["the prompts list", PROMPT_FILTERS],
];

test("every filter a list page carries survives a generated link", () => {
  for (const [what, filters] of CARRIED_BY) {
    for (const key of filters) {
      assert.ok(
        LINK_KEYS.includes(key),
        `${what} carries ?${key}, but utils/http/pageLink.js drops it, so ` +
          "every link the page builds loses it"
      );
    }
  }
});
