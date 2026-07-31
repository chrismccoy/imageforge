/**
 * Prompt templates
 */
window.ImageForgeTemplate = (function () {
  "use strict";

  const VARIABLE_PATTERN = "\\{([A-Za-z0-9 _-]+)\\}|\\[([A-Za-z0-9 _-]+)\\]";
  const MAX_VARIABLES = 20;

  function matcher() {
    return new RegExp(VARIABLE_PATTERN, "g");
  }

  /**
   * The variable names in a template, first appearance first.
   */
  function variablesIn(text) {
    const names = [];
    const source = String(text == null ? "" : text);
    const re = matcher();
    let found;

    while ((found = re.exec(source)) !== null) {
      const name = (found[1] || found[2] || "").trim();
      if (!name || names.indexOf(name) !== -1) continue;
      names.push(name);
      if (names.length >= MAX_VARIABLES) break;
    }
    return names;
  }

  /**
   * A template with its variables filled in, leaving empty ones visible.
   */
  function fillTemplate(text, values) {
    const source = String(text == null ? "" : text);
    return source.replace(matcher(), function (whole, curly, square) {
      const name = (curly || square || "").trim();
      const value = values ? values[name] : undefined;
      return typeof value === "string" && value.trim() ? value : whole;
    });
  }

  return { variablesIn: variablesIn, fillTemplate: fillTemplate };
})();
