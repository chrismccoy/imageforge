/**
 * Prompt modal
 *
 * Reads a prompt, and on the generations page edit one. Both pages that
 * open it share this partial, so the editing turns on only when the button
 * that opened the modal named a URL to save to: the prompts page keeps its
 * own edit page as the only way to change a saved prompt.
 */
(function () {
  const modal = document.getElementById("prompt-modal");
  if (!modal) return;

  const textEl = document.getElementById("prompt-modal-text");
  const editEl = document.getElementById("prompt-modal-edit");
  const copyBtn = document.getElementById("prompt-modal-copy");
  const editBtn = document.getElementById("prompt-modal-edit-start");
  const saveBtn = document.getElementById("prompt-modal-save");
  const cancelBtn = document.getElementById("prompt-modal-cancel");
  const ui = window.ImageForgeUi;
  const api = window.ImageForgeApi;

  if (!ui) return;

  // What the card's template says in place of a prompt an image never had.
  const EMPTY = "(no prompt)";

  let currentText = "";
  let source = null;
  let saveUrl = null;

  const show = (el, on) => {
    if (el) ui.show(el, on);
  };

  /**
   * Show the prompt as it stands, with the edit on offer where there is
   * somewhere to save it to.
   */
  function reading() {
    textEl.textContent = currentText || EMPTY;
    show(textEl, true);
    show(editEl, false);
    show(editBtn, Boolean(saveUrl && api));
    show(saveBtn, false);
    show(cancelBtn, false);
  }

  /**
   * Swap the prompt for a box holding it.
   */
  function writing() {
    if (!saveUrl || !api) return;
    editEl.value = currentText;
    show(textEl, false);
    show(editEl, true);
    show(editBtn, false);
    show(saveBtn, true);
    show(cancelBtn, true);
  }

  /**
   * Show the popup for the button
   */
  function open(btn) {
    source = btn;
    saveUrl = btn.getAttribute("data-prompt-save");
    currentText = btn.getAttribute("data-prompt") || "";
    reading();
    ui.resetLabel(copyBtn);
    ui.show(modal, true);
  }

  /**
   * Hide the popup, abandoning an edit in progress.
   */
  function close() {
    ui.show(modal, false);
  }

  /**
   * Type the new prompt to save over the old one
   */
  function repaint(text) {
    if (!source) return;
    source.setAttribute("data-prompt", text);

    const card = source.closest && source.closest("[data-generation-card]");
    if (!card) return;

    const line = card.querySelector("[data-row-prompt]");
    if (line) line.textContent = text || EMPTY;

    const image = card.querySelector("img");
    if (image) image.setAttribute("alt", text);
  }

  /**
   * Store what has been changed
   */
  async function save() {
    if (!saveUrl || !api || saveBtn.disabled) return;
    saveBtn.disabled = true;

    try {
      const body = await api.post(saveUrl, { prompt: editEl.value });
      currentText = body.prompt || "";
      repaint(currentText);
      reading();
    } catch (err) {
      api.notice(err.message || "Could not save the prompt.");
    } finally {
      saveBtn.disabled = false;
    }
  }

  document.querySelectorAll("[data-prompt-show]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      open(btn);
    });
  });

  document.querySelectorAll("[data-prompt-close]").forEach(function (el) {
    el.addEventListener("click", close);
  });

  if (editBtn) editBtn.addEventListener("click", writing);
  if (cancelBtn) cancelBtn.addEventListener("click", reading);
  if (saveBtn) saveBtn.addEventListener("click", save);

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
