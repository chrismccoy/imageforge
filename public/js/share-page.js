/**
 * Share page
 *
 * Copies the prompt shown on a public share page.
 */
(function () {
  const ui = window.ImageForgeUi;
  const btn = document.querySelector("[data-copy-prompt]");
  if (!ui || !btn) return;

  btn.addEventListener("click", function () {
    const text = btn.getAttribute("data-prompt") || "";
    if (!navigator.clipboard) {
      ui.flashLabel(btn, "Copy not supported");
      return;
    }
    navigator.clipboard.writeText(text).then(
      function () {
        ui.flashLabel(btn, "Copied");
      },
      function () {
        ui.flashLabel(btn, "Copy failed");
      }
    );
  });
})();
