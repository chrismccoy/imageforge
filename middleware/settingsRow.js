/**
 * The settings row, once per request
 */

"use strict";

/**
 * Build the middleware that puts the settings row on each request.
 */
function settingsRow(Settings) {
  return function (req, res, next) {
    let row;

    Object.defineProperty(req, "settings", {
      configurable: true,
      get() {
        if (row === undefined) row = Settings.get();
        return row;
      },
    });

    req.settingsChanged = () => {
      row = undefined;
    };

    next();
  };
}

module.exports = { settingsRow };
