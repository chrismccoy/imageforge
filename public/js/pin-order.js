/**
 * Prompt order
 */
window.ImageForgePinOrder = (function () {
  "use strict";

  /**
   * Two keys by code point, the order SQLite gives UTF-8 text.
   */
  function compareKeys(a, b) {
    const left = Array.from(a);
    const right = Array.from(b);
    const n = Math.min(left.length, right.length);
    for (let at = 0; at < n; at += 1) {
      const by = left[at].codePointAt(0) - right[at].codePointAt(0);
      if (by) return by;
    }
    return left.length - right.length;
  }

  /**
   * Rows in the order they should now appear.
   */
  function sortRows(rows) {
    return rows.slice().sort(function (a, b) {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return compareKeys(a.key, b.key) || (a.id || 0) - (b.id || 0);
    });
  }

  return { sortRows: sortRows };
})();
