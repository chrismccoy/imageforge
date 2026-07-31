/**
 * Compare an edit with the image it was made from
 */
(function () {
  "use strict";

  const wipes = window.ImageForgeWipe;
  const slider = document.getElementById("slider");
  const edited = document.getElementById("edited");
  const handle = document.getElementById("handle");
  if (!wipes || !slider || !edited) return;

  /**
   * Put the pictures and the seam where the slider says.
   */
  function wipe() {
    edited.style.clipPath = wipes.clipFor(slider.value);
    if (handle) handle.style.left = wipes.handleFor(slider.value);
  }

  slider.addEventListener("input", wipe);
  wipe();
})();
