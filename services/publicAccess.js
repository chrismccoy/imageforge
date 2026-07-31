/**
 * Public access
 */

"use strict";

const { env } = require("../config/env");
const { TOGGLES } = require("../config/toggles");

/**
 * Whether a toggle is on: the saved value when there is one, else the env value.
 */
function resolveToggle(settingValue, envValue) {
  if (settingValue === 0 || settingValue === 1) return Boolean(settingValue);
  return Boolean(envValue);
}

/**
 * Build the public access reader over the settings model.
 */
function createPublicAccess(Settings, { settings = env } = {}) {
  const access = {};

  for (const toggle of TOGGLES) {
    access[toggle.key] = (row) =>
      resolveToggle((row || Settings.get())[toggle.column], settings[toggle.env]);
  }

  return access;
}

module.exports = { createPublicAccess, resolveToggle };
