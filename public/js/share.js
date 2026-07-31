/**
 * Share links
 */
(function () {
  const buttons = document.querySelectorAll("[data-share]");
  if (!buttons.length) return;

  const dialog = document.getElementById("share-dialog");
  const dialogUrl = document.getElementById("share-dialog-url");
  const api = window.ImageForgeApi;
  const ui = window.ImageForgeUi;

  if (!api || !ui) return;

  /**
   * Show the fallback dialog with a url the visitor can copy by hand.
   */
  function openDialog(url) {
    if (!dialog) return;
    dialogUrl.value = url;
    ui.show(dialog, true);
    dialogUrl.focus();
    dialogUrl.select();
  }

  /**
   * Hide the fallback dialog.
   */
  function closeDialog() {
    ui.show(dialog, false);
  }

  if (dialog) {
    document.querySelectorAll("[data-share-dialog-close]").forEach(function (el) {
      el.addEventListener("click", closeDialog);
    });
    dialog.addEventListener("click", function (e) {
      if (e.target === dialog) closeDialog();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !dialog.hidden) closeDialog();
    });
  }

  /**
   * Ask the server for this generation's share urls, generating on first use.
   */
  async function mint(id) {
    return api.post("/generations/" + id + "/share");
  }

  /**
   * Copy a url, falling back to the dialog when the browser refuses.
   */
  async function copy(btn, url) {
    const full = window.location.origin + url;
    if (!navigator.clipboard) return openDialog(full);

    try {
      await navigator.clipboard.writeText(full);
      ui.flashLabel(btn, "Copied");
    } catch (err) {
      openDialog(full);
    }
  }

  /**
   * Mark a row as shared, now that it has a token.
   */
  function markShared(btn, urls) {
    const row = btn.closest("[data-share-row]") || document;
    const linkBtn = row.querySelector('[data-share="link"]');
    const imageBtn = row.querySelector('[data-share="image"]');
    if (linkBtn) linkBtn.setAttribute("data-share-url", urls.link);
    if (imageBtn) imageBtn.setAttribute("data-share-url", urls.image);

    ui.show(row.querySelector("[data-share-badge]"), true);
    ui.show(row.querySelector("[data-share-unshare]"), true);
    ui.show(row.querySelector("[data-share-none]"), false);
  }

  buttons.forEach(function (btn) {
    btn.addEventListener("click", async function () {
      const known = btn.getAttribute("data-share-url");
      if (known) return copy(btn, known);

      try {
        const urls = await mint(btn.getAttribute("data-gen-id"));
        markShared(btn, urls);
        await copy(
          btn,
          btn.getAttribute("data-share") === "image" ? urls.image : urls.link
        );
      } catch (err) {
        ui.flashLabel(btn, "Failed");
        api.notice(err.message || "Could not create the share link.");
      }
    });
  });
})();
