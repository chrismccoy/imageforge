/**
 * Prompt rating
 */
(function () {
  const api = window.ImageForgeApi;

  if (!api) return;

  /**
   * Fill the stars in one row up to a value.
   */
  function paint(group, rating) {
    group.setAttribute("data-rating", rating === null ? "" : String(rating));
    group.querySelectorAll("[data-star]").forEach(function (star) {
      const value = Number(star.getAttribute("data-star"));
      const on = rating !== null && value <= rating;
      star.classList.toggle("text-amber-400", on);
      star.classList.toggle("text-slate-300", !on);
    });
  }

  document.querySelectorAll("[data-rating-group]").forEach(function (group) {
    const id = group.getAttribute("data-prompt-id");

    group.querySelectorAll("[data-star]").forEach(function (star) {
      star.addEventListener("click", async function () {
        const current = group.getAttribute("data-rating");
        const value = Number(star.getAttribute("data-star"));
        const next = String(value) === current ? 0 : value;

        try {
          const body = await api.post("/prompts/" + id + "/rating/" + next);
          paint(group, body.rating);
        } catch (err) {
          api.notice(err.message || "Could not save the rating.");
        }
      });
    });
  });
})();
