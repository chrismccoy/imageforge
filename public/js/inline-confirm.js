/**
 * Inline delete confirm
 */
(function () {
  const ui = window.ImageForgeUi;
  if (!ui) return;

  document.querySelectorAll("[data-confirm]").forEach(function (group) {
    const openBtn = group.querySelector("[data-confirm-open]");
    const panel = group.querySelector("[data-confirm-panel]");
    const cancelBtn = group.querySelector("[data-confirm-cancel]");
    const hides = group.querySelectorAll("[data-confirm-hide]");
    if (!openBtn || !panel) return;

    /**
     * Show the confirm prompt, or put the plain buttons back.
     */
    function asking(on) {
      ui.show(openBtn, !on);
      hides.forEach(function (el) {
        ui.show(el, !on);
      });
      ui.show(panel, on);
    }

    openBtn.addEventListener("click", function () {
      asking(true);
    });
    if (cancelBtn)
      cancelBtn.addEventListener("click", function () {
        asking(false);
      });
  });
})();
