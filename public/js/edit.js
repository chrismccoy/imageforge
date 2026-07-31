/**
 * Runs in the browser on the Edit page.
 */
(function () {
  "use strict";

  const geometry = window.ImageForgeEditGeometry;
  const tools = window.ImageForgeEditStrokes;
  const api = window.ImageForgeApi;
  const ui = window.ImageForgeUi;

  if (!geometry || !tools || !api || !ui) return;

  const {
    toCanvasPoint,
    toCanvasBrush,
    ZOOM_LEVELS,
    zoomWidth,
    zoomLabel,
    zoomStage,
    centreOf,
    panBy,
    noteTouch,
  } = geometry;

  const {
    hintFor,
    placeholderFor,
    strokeFor,
    extendStroke,
    maskOps,
    looksTransparent,
    drawStrokes,
    MASK_COLOUR,
  } = tools;

  const GENERIC_ERR = api.GENERIC_ERR;

  const el = (id) => document.getElementById(id);

  const source = el("source");
  const mask = el("mask");
  const stage = el("stage");
  const viewport = el("viewport");
  const zoomOutBtn = el("zoom-out");
  const zoomInBtn = el("zoom-in");
  const zoomLevelEl = el("zoom-level");
  const promptField = el("prompt");
  const brushInput = el("brush");
  const undoBtn = el("undo-btn");
  const clearBtn = el("clear-btn");
  const modelSelect = el("model");
  const sizeSelect = el("size");
  const editBtn = el("edit-btn");
  const editLabel = el("edit-label");
  const editSpinner = el("edit-spinner");
  const statusEl = el("status");
  const result = el("result");
  const edited = el("edited");
  const saveBtn = el("save-btn");
  const revertBtn = el("revert-btn");
  const viewLink = el("view-link");
  const brushHint = el("brush-hint");
  const toolHint = el("tool-hint");
  const toolRow = document.querySelector("[data-tools]");
  const invertBtn = el("invert-btn");
  const wipeRow = el("wipe-row");
  const wipeSlider = el("wipe");
  const wipeHandle = el("wipe-handle");

  if (!mask || !source || !mask.getContext) return;

  const ctx = mask.getContext("2d");

  const strokes = [];
  let tool = "brush";
  let inverted = false;
  let stroke = null;
  let painting = false;
  let currentToken = null;

  /**
   * Show a status message, coloured by kind.
   */
  function setStatus(message, kind) {
    ui.setStatus(statusEl, message, kind);
  }

  /**
   * Repaint the overlay from the strokes.
   */
  function repaint() {
    const layer = drawStrokes(strokes, { width: mask.width, height: mask.height });

    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, mask.width, mask.height);

    if (!inverted) {
      ctx.fillStyle = MASK_COLOUR;
      ctx.fillRect(0, 0, mask.width, mask.height);
    }

    ctx.globalCompositeOperation = maskOps(inverted);
    ctx.drawImage(layer, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }

  let zoomAt = 0;

  const view = {
    read() {
      const rect = stage.getBoundingClientRect();
      return {
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
        clientWidth: viewport.clientWidth,
        clientHeight: viewport.clientHeight,
        width: rect.width,
        height: rect.height,
      };
    },
    setWidth(width) {
      if (width === null) {
        stage.style.width = "";
        stage.style.maxWidth = "";
      } else {
        stage.style.width = width + "px";
        stage.style.maxWidth = "none";
      }
    },
    setScroll(left, top) {
      viewport.scrollLeft = left;
      viewport.scrollTop = top;
    },
  };

  /**
   * Show the picture at the chosen zoom, keeping the middle of the view where it was.
   */
  function applyZoom() {
    const level = ZOOM_LEVELS[zoomAt];
    zoomStage(view, zoomWidth(level, mask.width));

    zoomLevelEl.textContent = zoomLabel(level);
    zoomOutBtn.disabled = zoomAt === 0;
    zoomInBtn.disabled = zoomAt === ZOOM_LEVELS.length - 1;
  }

  /**
   * Step through the levels, stopping at either end.
   */
  function stepZoom(by) {
    const next = zoomAt + by;
    if (next < 0 || next >= ZOOM_LEVELS.length) return;
    zoomAt = next;
    applyZoom();
  }

  zoomOutBtn.addEventListener("click", function () {
    stepZoom(-1);
  });

  zoomInBtn.addEventListener("click", function () {
    stepZoom(1);
  });

  /**
   * Match the canvas to the image's own pixels, once it has loaded.
   */
  function fitCanvas() {
    mask.width = source.naturalWidth || source.width;
    mask.height = source.naturalHeight || source.height;
    repaint();
    applyZoom();
  }

  if (source.complete) fitCanvas();
  source.addEventListener("load", fitCanvas);

  applyZoom();

  /**
   * Where a pointer event landed, in image pixels.
   */
  function pointFrom(event) {
    return toCanvasPoint(
      event,
      stage.getBoundingClientRect(),
      mask.width,
      mask.height
    );
  }

  const touches = new Map();

  function touchCentre() {
    return centreOf(Array.from(touches.values()));
  }

  function abandonStroke() {
    if (stroke) {
      const at = strokes.indexOf(stroke);
      if (at !== -1) strokes.splice(at, 1);
      stroke = null;
      repaint();
    }
    painting = false;
  }

  mask.addEventListener("pointerdown", function (event) {
    if (event.pointerType === "touch") {
      if (noteTouch(touches, event)) {
        abandonStroke();
        return;
      }
    }

    painting = true;
    mask.setPointerCapture(event.pointerId);
    stroke = strokeFor(
      tool,
      toCanvasBrush(
        Number(brushInput.value) || Number(brushInput.defaultValue),
        stage.getBoundingClientRect(),
        mask.width
      ),
      pointFrom(event)
    );
    strokes.push(stroke);
    repaint();
  });

  mask.addEventListener("pointermove", function (event) {
    if (event.pointerType === "touch" && touches.has(event.pointerId)) {
      const before = touchCentre();
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (touches.size > 1) {
        const moved = panBy(
          { left: viewport.scrollLeft, top: viewport.scrollTop },
          before,
          touchCentre()
        );
        viewport.scrollLeft = moved.left;
        viewport.scrollTop = moved.top;
        return;
      }
    }

    if (!painting || !stroke) return;
    extendStroke(stroke, pointFrom(event));
    repaint();
  });

  ["pointerup", "pointercancel", "pointerleave"].forEach(function (name) {
    mask.addEventListener(name, function (event) {
      touches.delete(event.pointerId);
      painting = false;
      stroke = null;
    });
  });

  if (toolRow) {
    toolRow.addEventListener("click", function (event) {
      const button = event.target.closest("[data-tool]");
      if (!button) return;

      tool = button.getAttribute("data-tool");
      toolRow.querySelectorAll("[data-tool]").forEach(function (other) {
        other.setAttribute("aria-pressed", String(other === button));
      });
      if (toolHint) toolHint.textContent = hintFor(tool);
      if (promptField) promptField.placeholder = placeholderFor(tool);
    });
  }

  if (invertBtn) {
    invertBtn.addEventListener("click", function () {
      inverted = !inverted;
      invertBtn.setAttribute("aria-pressed", String(inverted));
      repaint();
    });
  }

  undoBtn.addEventListener("click", function () {
    strokes.pop();
    repaint();
  });

  clearBtn.addEventListener("click", function () {
    strokes.length = 0;
    repaint();
  });

  /**
   * The overlay as a PNG blob: the mask.
   */
  function maskBlob() {
    return new Promise(function (resolve) {
      mask.toBlob(resolve, "image/png");
    });
  }

  /**
   * The source image as a PNG blob at its natural size.
   */
  function sourceBlob() {
    const copy = document.createElement("canvas");
    copy.width = mask.width;
    copy.height = mask.height;
    copy.getContext("2d").drawImage(source, 0, 0, copy.width, copy.height);
    return new Promise(function (resolve) {
      copy.toBlob(resolve, "image/png");
    });
  }

  /**
   * Whether anything has been brushed at all.
   */
  function hasMask() {
    return strokes.some(function (item) {
      return item.points.length > 0;
    });
  }

  /**
   * Move the seam between the original and the result.
   */
  function wipeTo(percent) {
    const wipes = window.ImageForgeWipe;
    if (!wipes) return;
    edited.style.clipPath = wipes.clipFor(percent);
    if (wipeHandle) wipeHandle.style.left = wipes.handleFor(percent);
  }

  /**
   * Offer the wipe, or take it away.
   */
  function showWipe(on) {
    if (wipeRow) wipeRow.hidden = !on;
    if (wipeHandle) wipeHandle.hidden = !on;
    if (!wipeSlider) return;

    wipeSlider.value = "0";
    wipeTo(0);
  }

  if (wipeSlider) {
    wipeSlider.addEventListener("input", function () {
      wipeTo(wipeSlider.value);
    });
  }

  /**
   * Show the result where the picture was, so the change is where it was
   * brushed.
   */
  function showResult(url) {
    edited.src = url;
    edited.hidden = false;
    mask.hidden = true;
    brushHint.hidden = true;
    result.hidden = false;
    viewLink.hidden = true;
    showWipe(true);
  }

  /**
   * Put the brush back over the original, keeping the strokes that made the
   * edit so a second try starts from the same region.
   */
  function showBrush() {
    edited.hidden = true;
    mask.hidden = false;
    brushHint.hidden = false;
    result.hidden = true;
    showWipe(false);
  }

  /**
   * Put the button in its working state, or take it out of it.
   */
  function working(on) {
    editBtn.disabled = on;
    editLabel.textContent = on ? "Working…" : "Make the edit";
    editSpinner.hidden = !on;
  }

  editBtn.addEventListener("click", async function () {
    const prompt = promptField.value.trim();
    if (!prompt) return setStatus("Describe what should be there.", "error");
    if (!hasMask()) return setStatus("Brush over the part to change.", "error");

    working(true);
    setStatus("Editing…");

    try {
      const body = new FormData();
      body.append("_csrf", api.csrfToken);
      body.append("prompt", prompt);
      body.append("model", modelSelect.value);
      body.append("size", sizeSelect.value);
      body.append("source_id", mask.getAttribute("data-source-id") || "");
      body.append("image", await sourceBlob(), "source.png");
      body.append("mask", await maskBlob(), "mask.png");

      const data = await api.post("/api/edit", body);

      currentToken = data.token;
      showResult(data.url);
      saveBtn.disabled = false;
      saveBtn.textContent = "Save";
      setStatus("Done. Save it to keep it.", "success");
    } catch (err) {
      setStatus(err.message || GENERIC_ERR, "error");
    } finally {
      working(false);
    }
  });

  revertBtn.addEventListener("click", function () {
    showBrush();
    setStatus(
      currentToken ? "That edit is not saved. Make it again to keep one." : ""
    );
    currentToken = null;
  });

  /**
   * The result and the picture it was made from
   */
  function flattenOnto(canvas) {
    const into = canvas.getContext("2d");
    into.drawImage(source, 0, 0, canvas.width, canvas.height);
    into.drawImage(edited, 0, 0, canvas.width, canvas.height);

    return new Promise(function (resolve) {
      canvas.toBlob(resolve, "image/png");
    });
  }

  /**
   * Hand back a flattened copy when the result came back
   */
  async function flattenIfSeeThrough(token) {
    if (!edited.naturalWidth) return;

    const canvas = document.createElement("canvas");
    canvas.width = edited.naturalWidth;
    canvas.height = edited.naturalHeight;
    const into = canvas.getContext("2d", { willReadFrequently: true });
    into.drawImage(edited, 0, 0);

    if (!looksTransparent(into.getImageData(0, 0, canvas.width, canvas.height))) {
      return;
    }

    const blob = await flattenOnto(canvas);
    if (!blob) return;

    const body = new FormData();
    body.append("_csrf", api.csrfToken);
    body.append("token", token);
    body.append("image", blob, "flat.png");

    try {
      await api.post("/api/flatten", body);
    } catch (err) {
      api.notice("The edit could not be flattened, so it is saved as it came.");
    }
  }

  saveBtn.addEventListener("click", async function () {
    if (!currentToken) return;
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    try {
      await flattenIfSeeThrough(currentToken);
      await api.post("/api/save", { token: currentToken });

      currentToken = null;
      saveBtn.textContent = "Saved";
      viewLink.hidden = false;
      setStatus("Saved.", "success");
    } catch (err) {
      setStatus(err.message || "Could not save.", "error");
      saveBtn.disabled = false;
      saveBtn.textContent = "Save";
    }
  });
})();
