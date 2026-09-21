/**
 * A log for tests that mean to fail
 */

"use strict";

function quietLog() {
  const lines = [];

  const record = (level) =>
    function (...parts) {
      lines.push({
        level,
        text: parts
          .map((part) =>
            part && part.stack
              ? part.stack
              : part instanceof Error
                ? part.message
                : String(part)
          )
          .join(" "),
      });
    };

  return {
    error: record("error"),
    warn: record("warn"),
    info: record("info"),
    log: record("log"),
    lines,

    text() {
      return lines.map((line) => line.text).join("\n");
    },

    said(pattern) {
      return lines.some((line) => pattern.test(line.text));
    },
  };
}

module.exports = { quietLog };
