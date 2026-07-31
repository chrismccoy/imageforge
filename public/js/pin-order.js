/**
 * Prompt order
 */
window.ImageForgePinOrder = (function () {
  "use strict";

  /**
   * Rows in the order they should now appear.
   */
  function sortRows(rows) {
    return rows.slice().sort(function (a, b) {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.key === b.key) return 0;
      return a.key < b.key ? -1 : 1;
    });
  }

  return { sortRows: sortRows };
})();
