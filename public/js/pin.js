/**
 * Pinned prompts
 */
(function () {
  "use strict";

  const order = window.ImageForgePinOrder;
  const api = window.ImageForgeApi;

  if (!order || !api) return;

  const sortRows = order.sortRows;

  /**
   * Show a button as pinned or not.
   */
  function paint(button, on) {
    button.setAttribute("aria-pressed", on ? "true" : "false");
    button.setAttribute("title", on ? "Pinned to the top" : "Pin to the top");
    button.classList.toggle("text-brand-600", on);
    button.classList.toggle("text-slate-300", !on);
  }

  /**
   * Put the rows in their new order.
   */
  function reorder(body) {
    const rows = Array.prototype.map.call(
      body.querySelectorAll("[data-prompt-row]"),
      function (row) {
        return {
          row: row,
          key: row.getAttribute("data-sort-key") || "",
          pinned:
            row.querySelector("[data-pin]").getAttribute("aria-pressed") === "true",
        };
      }
    );

    sortRows(rows).forEach(function (item) {
      body.appendChild(item.row);
    });
  }

  /**
   * Keep the keyboard on the button that was just pressed.
   */
  function keepFocus(button) {
    button.focus();
  }

  document.addEventListener("click", async function (event) {
    const button = event.target.closest("[data-pin]");
    if (!button) return;

    const next = button.getAttribute("aria-pressed") !== "true";
    const id = button.getAttribute("data-prompt-id");

    try {
      const reply = await api.post("/prompts/" + id + "/pin", {
        pinned: next ? "1" : "",
      });
      paint(button, Boolean(reply.pinned));
      const body = document.querySelector("[data-prompt-rows]");
      if (body) reorder(body);
      keepFocus(button);
    } catch (err) {
      api.notice(err.message || "Could not pin that prompt.");
    }
  });
})();
