/**
 * Wipe slider
 */
window.ImageForgeWipe = (function () {
  "use strict";

  /**
   * A slider position as a percentage across the picture.
   */
  function handleFor(percent) {
    const n = Number(percent);
    return (Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 50) + "%";
  }

  /**
   * The clip on the top picture for a slider position.
   */
  function clipFor(percent) {
    return "inset(0 0 0 " + handleFor(percent) + ")";
  }

  return { clipFor: clipFor, handleFor: handleFor };
})();
