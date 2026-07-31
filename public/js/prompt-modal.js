/**
 * Prompt modal
 */
(function () {
  const modal = document.getElementById("prompt-modal");
  if (!modal) return;

  const textEl = document.getElementById("prompt-modal-text");
  const copyBtn = document.getElementById("prompt-modal-copy");
  const ui = window.ImageForgeUi;

  if (!ui) return;

  let currentText = "";

  /**
   * Show the popup with the given prompt text.
   */
  function open(text) {
    currentText = text;
    textEl.textContent = text;
    ui.resetLabel(copyBtn);
    ui.show(modal, true);
  }

  /**
   * Hide the popup.
   */
  function close() {
    ui.show(modal, false);
  }

  document.querySelectorAll("[data-prompt-show]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      open(btn.getAttribute("data-prompt") || "");
    });
  });

  document.querySelectorAll("[data-prompt-close]").forEach(function (el) {
    el.addEventListener("click", close);
  });

  modal.addEventListener("click", function (e) {
    if (e.target === modal) close();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !modal.hidden) close();
  });

  /**
   * Copy the shown prompt to the clipboard and give quick feedback.
   */
  function copyPrompt() {
    if (!navigator.clipboard) {
      ui.flashLabel(copyBtn, "Copy not supported");
      return;
    }
    navigator.clipboard.writeText(currentText).then(
      function () {
        ui.flashLabel(copyBtn, "Copied");
      },
      function () {
        ui.flashLabel(copyBtn, "Copy failed");
      }
    );
  }

  copyBtn.addEventListener("click", copyPrompt);
})();
