/**
 * Prompt character counter
 */
(function () {
  "use strict";

  /**
   * How many characters are in a string.
   */
  function characters(text) {
    return text == null ? 0 : Array.from(String(text)).length;
  }

  /**
   * The counter's wording for some text.
   */
  function countLabel(text) {
    const n = characters(text);
    return n.toLocaleString("en-US") + (n === 1 ? " character" : " characters");
  }

  if (typeof window !== "undefined") {
    window.ImageForgeCharCount = { characters, countLabel };
  }

  const counters = document.querySelectorAll("[data-char-count]");

  Array.prototype.forEach.call(counters, function (output) {
    const field = document.getElementById(output.getAttribute("data-char-count"));
    if (!field) return;

    const update = function () {
      output.textContent = countLabel(field.value);
    };

    field.addEventListener("input", update);
    update();
  });
})();
