/**
 * Favorite toggle
 */
(function () {
  const api = window.ImageForgeApi;
  const ui = window.ImageForgeUi;

  if (!api || !ui) return;

  const hide = (el) => ui.show(el, false);

  /**
   * Show a button as starred or not.
   */
  function paint(button, on) {
    button.setAttribute("aria-pressed", on ? "true" : "false");
    button.classList.toggle("text-amber-400", on);
    button.classList.toggle("text-white/70", !on);
  }

  // Only the favourites view removes a card when its star is removed
  const onFavouritesView = Boolean(
    document.querySelector("[data-favourites-view]")
  );
  const grid = document.querySelector("[data-list-grid]");
  const emptyState = document.querySelector("[data-empty-state]");
  const heads = document.querySelectorAll("[data-list-head]");
  const bulkBar = document.getElementById("bulk-generations");

  /**
   * Drop a card that no longer belongs here, and show the empty state when it
   * is the last one.
   */
  function removeCard(button) {
    const card = button.closest("[data-generation-card]");
    if (!card || !grid) return;

    card.remove();
    if (grid.children.length) return;

    hide(grid);
    hide(bulkBar);
    heads.forEach(hide);
    if (emptyState) emptyState.hidden = false;
  }

  document.querySelectorAll("[data-favorite]").forEach(function (button) {
    button.addEventListener("click", async function () {
      if (button.disabled) return;
      button.disabled = true;

      try {
        const body = await api.post(
          "/generations/" + button.getAttribute("data-gen-id") + "/favorite"
        );
        const on = body.favorite === 1;
        paint(button, on);
        if (!on && onFavouritesView) removeCard(button);
      } catch (err) {
        api.notice(err.message || "Could not change the favourite.");
      } finally {
        button.disabled = false;
      }
    });
  });
})();
