/**
 * The brand columns on the settings row
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");

const schema = require("../../../db/schema");
const buildSettings = require("../../../models/settings");

function freshSettings() {
  const db = new Database(":memory:");
  schema.init(db);
  return buildSettings(db);
}

test("a new install stores no brand at all", () => {
  const row = freshSettings().get();
  assert.equal(row.brand_name, null);
  assert.equal(row.brand_icon, null);
  assert.equal(row.brand_mark, null);
});

test("a saved name and mark come back cleaned", () => {
  const Settings = freshSettings();
  Settings.update({
    brand_name: "  Pixel Barn  ",
    brand_icon: "FA-SOLID FA-CAMERA",
    brand_mark: true,
  });

  const row = Settings.get();
  assert.equal(row.brand_name, "Pixel Barn");
  assert.equal(row.brand_icon, "fa-solid fa-camera");
  assert.equal(row.brand_mark, 1);
});

test("clearing a box stores null rather than the default", () => {
  const Settings = freshSettings();
  Settings.update({ brand_name: "Pixel Barn", brand_icon: "fa-solid fa-camera" });
  Settings.update({ brand_name: "", brand_icon: "" });

  const row = Settings.get();
  assert.equal(row.brand_name, null);
  assert.equal(row.brand_icon, null);
});

test("an icon that is not Font Awesome classes is not stored", () => {
  const Settings = freshSettings();
  Settings.update({ brand_icon: "fa-solid fa-camera" });
  Settings.update({ brand_icon: "camrea" });

  assert.equal(Settings.get().brand_icon, null);
});

test("an update that says nothing about the brand leaves it alone", () => {
  const Settings = freshSettings();
  Settings.update({
    brand_name: "Pixel Barn",
    brand_icon: "fa-solid fa-camera",
    brand_mark: false,
  });
  Settings.update({ page_size: 12 });

  const row = Settings.get();
  assert.equal(row.brand_name, "Pixel Barn");
  assert.equal(row.brand_icon, "fa-solid fa-camera");
  assert.equal(row.brand_mark, 0);
  assert.equal(row.page_size, 12);
});
