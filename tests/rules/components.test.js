/**
 * The component layer
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const CSS = path.join(__dirname, "..", "..", "public", "css", "app.css");

const NAMES = [
  "btn",
  "btn-primary",
  "btn-quiet",
  "btn-danger",
  "btn-dark",
  "btn-sm",
  "btn-disabled",
  "card",
  "card-head",
  "card-body",
  "pill",
  "chip",
  "filter-bar",
  "kpi-label",
  "kpi-value",
  "field-label",
  "help",
  "empty",
  "data-table",
  "toggle-row",
  "notice",
  "notice-warn",
  "notice-error",
  "notice-ok",
  "notice-info",
];

test("every component the views name is in the built stylesheet", () => {
  const css = fs.readFileSync(CSS, "utf8");
  for (const name of NAMES) {
    assert.ok(css.includes(`.${name}{`), `.${name} is not built`);
  }
});
