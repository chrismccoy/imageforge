/**
 * Shared page helpers
 */
window.ImageForgeUi = (function () {
  "use strict";

  const FLASH_MS = 2000;

  const timers = new WeakMap();
  const labels = new WeakMap();

  /**
   * A byte count as something readable.
   */
  function readableBytes(bytes) {
    if (!Number.isFinite(bytes)) return "—";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
    return (bytes / 1024 / 1024).toFixed(1) + " MB";
  }

  /**
   * Write the status line under a button
   */
  function setStatus(el, message, kind) {
    if (!el) return;
    el.textContent = message || "";
    el.className =
      "mt-3 min-h-5 text-sm " +
      (kind === "error"
        ? "text-red-600"
        : kind === "success"
          ? "text-green-600"
          : "text-slate-500");
  }

  /**
   * Show a word on a button for a moment, then put its own label back.
   */
  function flashLabel(btn, text, ms) {
    if (!btn) return;
    if (!labels.has(btn)) labels.set(btn, btn.innerHTML);

    btn.textContent = text;
    clearTimeout(timers.get(btn));
    timers.set(
      btn,
      setTimeout(function () {
        btn.innerHTML = labels.get(btn);
      }, ms || FLASH_MS)
    );
  }

  /**
   * Put a button's own label back, dropping any flash still pending.
   */
  function resetLabel(btn) {
    if (!btn) return;
    clearTimeout(timers.get(btn));
    timers.delete(btn);
    if (labels.has(btn)) btn.innerHTML = labels.get(btn);
  }

  /**
   * Show or hide an element.
   */
  function show(el, on) {
    if (!el) return;
    el.hidden = !on;
  }

  return { readableBytes, setStatus, flashLabel, resetLabel, show, FLASH_MS };
})();
