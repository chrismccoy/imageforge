/**
 * Copy-to-clipboard buttons
 */
(function () {
  "use strict";
  const ui = window.ImageForgeUi;
  const FLASH_MS = 2000;
  const labels = new WeakMap();
  const timers = new WeakMap();

  /**
   * Say how the copy went, with or without the shared helpers.
   */
  function flash(btn, text) {
    if (ui) return ui.flashLabel(btn, text);

    if (!labels.has(btn)) labels.set(btn, btn.innerHTML);
    btn.textContent = text;
    clearTimeout(timers.get(btn));
    timers.set(
      btn,
      setTimeout(function () {
        btn.innerHTML = labels.get(btn);
      }, FLASH_MS)
    );
  }

  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", async function () {
      try {
        if (!navigator.clipboard) throw new Error("no clipboard API");
        await navigator.clipboard.writeText(btn.getAttribute("data-copy"));
        flash(btn, "Copied");
      } catch (err) {
        flash(btn, "Copy failed");
      }
    });
  });
})();
