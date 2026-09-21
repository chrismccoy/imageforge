/**
 * Brand values
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_BRAND_NAME,
  DEFAULT_BRAND_ICON,
  MAX_BRAND_NAME,
  toStoredName,
  toStoredIcon,
  brandName,
  brandIcon,
  brandMark,
  resolveBrand,
} = require("../../../config/brand");

test("the defaults are what the pages already said", () => {
  assert.equal(DEFAULT_BRAND_NAME, "Image Forge");
  assert.equal(DEFAULT_BRAND_ICON, "fa-solid fa-bolt");
});

test("every spelling of 'not set' stores as null", () => {
  assert.equal(toStoredName(null), null);
  assert.equal(toStoredName(undefined), null);
  assert.equal(toStoredName(""), null);
  assert.equal(toStoredName("   "), null);
  assert.equal(toStoredIcon(null), null);
  assert.equal(toStoredIcon(""), null);
});

test("a stored name is trimmed and clamped rather than refused", () => {
  assert.equal(toStoredName("  Pixel Barn  "), "Pixel Barn");
  const long = "x".repeat(MAX_BRAND_NAME + 10);
  assert.equal(toStoredName(long).length, MAX_BRAND_NAME);
});

test("an icon must be Font Awesome classes and nothing else", () => {
  assert.equal(toStoredIcon("fa-solid fa-camera"), "fa-solid fa-camera");
  assert.equal(toStoredIcon("  FA-SOLID   FA-CAMERA "), "fa-solid fa-camera");
  assert.equal(toStoredIcon("fa-brands fa-github"), "fa-brands fa-github");

  assert.equal(toStoredIcon("camera"), null, "no fa- prefix");
  assert.equal(toStoredIcon("fa-solid hidden"), null, "one token is not fa-");
  assert.equal(toStoredIcon('fa-solid" onload="x'), null, "not a class list");
  assert.equal(toStoredIcon("fa-a fa-b fa-c fa-d"), null, "too many tokens");
});

test("the saved value beats the environment, which beats the default", () => {
  assert.equal(brandName("Pixel Barn", "Env Name"), "Pixel Barn");
  assert.equal(brandName(null, "Env Name"), "Env Name");
  assert.equal(brandName(null, ""), DEFAULT_BRAND_NAME);
  assert.equal(brandName("", undefined), DEFAULT_BRAND_NAME);

  assert.equal(
    brandIcon("fa-solid fa-camera", "fa-solid fa-star"),
    "fa-solid fa-camera"
  );
  assert.equal(brandIcon(null, "fa-solid fa-star"), "fa-solid fa-star");
  assert.equal(brandIcon(null, ""), DEFAULT_BRAND_ICON);
});

test("junk at one level falls through to the next", () => {
  assert.equal(brandIcon("nonsense", "fa-solid fa-star"), "fa-solid fa-star");
  assert.equal(brandIcon("nonsense", "also nonsense"), DEFAULT_BRAND_ICON);
});

test("the footer mark is on unless it is switched off", () => {
  assert.equal(brandMark(null), true, "a migrated column keeps the line");
  assert.equal(
    brandMark(undefined),
    true,
    "so does a row read before the column existed"
  );
  assert.equal(brandMark(1), true);
  assert.equal(brandMark(0), false);
});

test("resolveBrand answers for an empty row from the environment alone", () => {
  assert.deepEqual(resolveBrand({}, { BRAND_NAME: "", BRAND_ICON: "" }), {
    name: DEFAULT_BRAND_NAME,
    icon: DEFAULT_BRAND_ICON,
    mark: true,
  });

  assert.deepEqual(
    resolveBrand(
      { brand_name: "Pixel Barn", brand_icon: "fa-solid fa-camera", brand_mark: 0 },
      { BRAND_NAME: "Env Name", BRAND_ICON: "fa-solid fa-star" }
    ),
    { name: "Pixel Barn", icon: "fa-solid fa-camera", mark: false }
  );
});
