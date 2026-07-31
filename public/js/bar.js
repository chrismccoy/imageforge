/**
 * Percent bars (storage, and anything else that fills to a share of 100)
 */
(function () {
  "use strict";

  document.querySelectorAll("[data-bar-percent]").forEach(function (bar) {
    const n = Number(bar.getAttribute("data-bar-percent"));
    const percent = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
    bar.style.width = percent + "%";
  });
})();
