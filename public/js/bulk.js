/**
 * Bulk selection
 */
(function () {
  const ui = window.ImageForgeUi;
  if (!ui) return;

  const reveal = ui.show;

  document.querySelectorAll("[data-bulk]").forEach(function (bar) {
    const formId = bar.getAttribute("data-bulk");
    const boxes = document.querySelectorAll('[name="ids"][form="' + formId + '"]');
    const all = bar.querySelector("[data-bulk-all]");
    const count = bar.querySelector("[data-bulk-count]");
    const actions = bar.querySelectorAll("[data-bulk-action]");
    const cells = document.querySelectorAll("[data-bulk-cell]");
    const idle = document.querySelector("[data-bulk-idle]");
    const start = document.querySelector("[data-bulk-start]");
    const cancel = bar.querySelector("[data-bulk-cancel]");

    /**
     * Enter or leave selection mode.
     */
    function setMode(on) {
      reveal(bar, on);
      reveal(idle, !on);
      cells.forEach(function (cell) {
        reveal(cell, on);
      });

      if (!on) {
        boxes.forEach(function (box) {
          box.checked = false;
        });
        refresh();
      }
    }

    /**
     * Show how many are checked
     */
    function refresh() {
      let chosen = 0;
      boxes.forEach(function (box) {
        if (box.checked) chosen += 1;
      });

      if (count)
        count.textContent = chosen ? chosen + " selected" : "None selected";
      actions.forEach(function (button) {
        button.disabled = chosen === 0;
      });
      if (all) all.checked = chosen > 0 && chosen === boxes.length;
    }

    boxes.forEach(function (box) {
      box.addEventListener("change", refresh);
    });

    if (all) {
      all.addEventListener("change", function () {
        boxes.forEach(function (box) {
          box.checked = all.checked;
        });
        refresh();
      });
    }

    if (start)
      start.addEventListener("click", function () {
        setMode(true);
      });
    if (cancel)
      cancel.addEventListener("click", function () {
        setMode(false);
      });

    setMode(false);
  });
})();
