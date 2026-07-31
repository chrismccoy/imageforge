/**
 * Crop
 *
 * A box over the picture, dragged and resized, and the part of the real image
 * it names. The cropping itself is done here on a canvas rather than on the
 * server, because the server has no image library
 */
(function () {
  "use strict";

  const geometry = window.ImageForgeCropGeometry;
  const api = window.ImageForgeApi;
  const ui = window.ImageForgeUi;

  if (!geometry || !api || !ui) return;

  const { clampBox, applyRatio, toNaturalBox, dragBox } = geometry;

  const el = (id) => document.getElementById(id);

  const source = el("source");
  const stage = el("stage");
  const boxEl = el("crop-box");
  const sizeOut = el("crop-size");
  const cropBtn = el("crop-btn");
  const cropLabel = el("crop-label");
  const resetBtn = el("reset-btn");
  const statusEl = el("status");
  const savedEl = el("saved");
  const ratioRow = document.querySelector("[data-ratios]");

  if (!source || !stage || !boxEl) return;

  const shades = {
    top: el("shade-top"),
    bottom: el("shade-bottom"),
    left: el("shade-left"),
    right: el("shade-right"),
  };

  let box = { x: 0, y: 0, width: 0, height: 0 };
  let ratio = null;
  let drag = null;

  /**
   * The picture's size on screen.
   */
  function bounds() {
    return { width: source.clientWidth, height: source.clientHeight };
  }

  /**
   * Put one shade panel where it belongs.
   */
  function shade(panel, left, top, width, height) {
    panel.style.left = left + "px";
    panel.style.top = top + "px";
    panel.style.width = Math.max(0, width) + "px";
    panel.style.height = Math.max(0, height) + "px";
  }

  /**
   * Draw the box, the four shades around it, and the size it names.
   */
  function paint() {
    const shown = bounds();
    boxEl.style.left = box.x + "px";
    boxEl.style.top = box.y + "px";
    boxEl.style.width = box.width + "px";
    boxEl.style.height = box.height + "px";

    // Four panels rather than one overlay with a hole cut in it.
    shade(shades.top, 0, 0, shown.width, box.y);
    shade(
      shades.bottom,
      0,
      box.y + box.height,
      shown.width,
      shown.height - box.y - box.height
    );
    shade(shades.left, 0, box.y, box.x, box.height);
    shade(
      shades.right,
      box.x + box.width,
      box.y,
      shown.width - box.x - box.width,
      box.height
    );

    const real = toNaturalBox(
      box,
      shown,
      source.naturalWidth,
      source.naturalHeight
    );
    sizeOut.textContent = real.width + " × " + real.height;
  }

  /**
   * Put a box on screen, held inside the picture and in the chosen shape.
   */
  function setBox(next) {
    box = applyRatio(clampBox(next, bounds()), ratio, bounds());
    paint();
  }

  /**
   * The whole picture, which is where a crop starts.
   */
  function reset() {
    const shown = bounds();
    setBox({ x: 0, y: 0, width: shown.width, height: shown.height });
  }

  if (source.complete) reset();
  source.addEventListener("load", reset);
  window.addEventListener("resize", reset);

  /**
   * Follow a drag on the box or one of its handles.
   */
  stage.addEventListener("pointerdown", function (event) {
    const handleEl = event.target.closest("[data-handle]");
    const inside = event.target.closest("#crop-box");
    if (!handleEl && !inside) return;

    event.preventDefault();
    drag = {
      handle: handleEl ? handleEl.getAttribute("data-handle") : null,
      fromX: event.clientX,
      fromY: event.clientY,
      start: box,
    };
    stage.setPointerCapture(event.pointerId);
  });

  stage.addEventListener("pointermove", function (event) {
    if (!drag) return;
    setBox(
      dragBox(
        drag.start,
        drag.handle,
        event.clientX - drag.fromX,
        event.clientY - drag.fromY
      )
    );
  });

  ["pointerup", "pointercancel"].forEach(function (name) {
    stage.addEventListener(name, function () {
      drag = null;
    });
  });

  if (ratioRow) {
    ratioRow.addEventListener("click", function (event) {
      const button = event.target.closest("[data-ratio]");
      if (!button) return;

      ratio = Number(button.getAttribute("data-ratio")) || null;
      ratioRow.querySelectorAll("[data-ratio]").forEach(function (other) {
        other.setAttribute("aria-pressed", String(other === button));
      });
      setBox(box);
    });
  }

  if (resetBtn) resetBtn.addEventListener("click", reset);

  /**
   * Cut the chosen region out of the picture, at its own pixels.
   */
  function cut() {
    const real = toNaturalBox(
      box,
      bounds(),
      source.naturalWidth,
      source.naturalHeight
    );
    const canvas = document.createElement("canvas");
    canvas.width = real.width;
    canvas.height = real.height;
    canvas
      .getContext("2d")
      .drawImage(
        source,
        real.x,
        real.y,
        real.width,
        real.height,
        0,
        0,
        real.width,
        real.height
      );

    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) {
        resolve({ blob: blob, size: real.width + "x" + real.height });
      }, "image/png");
    });
  }

  cropBtn.addEventListener("click", async function () {
    cropBtn.disabled = true;
    cropLabel.textContent = "Cropping…";
    ui.setStatus(statusEl, "");

    try {
      const cropped = await cut();

      const body = new FormData();
      body.append("_csrf", api.csrfToken);
      body.append("source_id", boxEl.getAttribute("data-source-id") || "");
      body.append("size", cropped.size);
      body.append("image", cropped.blob, "crop.png");

      const held = await api.post("/api/crop", body);
      await api.post("/api/save", { token: held.token });

      ui.setStatus(statusEl, "Saved as a new image.", "success");
      ui.show(savedEl, true);
      cropLabel.textContent = "Crop";
    } catch (err) {
      ui.setStatus(statusEl, err.message || api.GENERIC_ERR, "error");
      cropLabel.textContent = "Crop";
      cropBtn.disabled = false;
    }
  });
})();
