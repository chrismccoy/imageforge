/**
 * Template fields
 */
(function () {
  "use strict";

  const tools = window.ImageForgeTemplate;
  const select = document.getElementById("prompt-select");
  const block = document.getElementById("variables");
  const promptField = document.getElementById("prompt");
  if (!tools || !select || !block || !promptField) return;

  let template = "";
  let values = {};

  /**
   * Write the filled template into the Prompt box.
   */
  function render() {
    promptField.value = tools.fillTemplate(template, values);
    promptField.dispatchEvent(new Event("input"));
  }

  /**
   * Build a labelled box per variable, or empty the block when there are none.
   */
  function build(names) {
    block.textContent = "";
    values = {};

    if (!names.length) {
      block.hidden = true;
      return;
    }

    const title = document.createElement("p");
    title.className = "mb-1 block text-sm font-medium";
    title.textContent = "Variables";
    block.appendChild(title);

    names.forEach(function (name) {
      const label = document.createElement("label");
      label.className = "mb-2 block text-xs text-slate-500";
      label.textContent = name;

      const input = document.createElement("input");
      input.type = "text";
      input.className =
        "mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none";
      input.addEventListener("input", function () {
        values[name] = input.value;
        render();
      });

      label.appendChild(input);
      block.appendChild(label);
    });

    block.hidden = false;
  }

  select.addEventListener("change", function () {
    template = select.value || "";
    build(tools.variablesIn(template));
    if (template) render();
  });
})();
