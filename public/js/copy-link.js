/**
 * Copy-to-clipboard buttons
 */
(function () {
  "use strict";
  const ui = window.ImageForgeUi;

  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", async function () {
      try {
        if (!navigator.clipboard) throw new Error("no clipboard API");
        await navigator.clipboard.writeText(btn.getAttribute("data-copy"));
        ui.flashLabel(btn, "Copied");
      } catch (err) {
        ui.flashLabel(btn, "Copy failed");
      }
    });
  });
})();
