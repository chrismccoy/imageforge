/**
 * Generate script
 */
(function () {
  "use strict";

  const el = (id) => document.getElementById(id);

  const promptSelect = el("prompt-select");
  const promptField = el("prompt");
  const sizeSelect = el("size");
  const modelSelect = el("model");
  const countSelect = el("count");
  const compareBox = el("compare");
  const grid = el("grid");
  const tiles = el("tiles");
  const spinnerText = el("spinner-text");
  const generateBtn = el("generate-btn");
  const statusEl = el("status");
  const placeholder = el("placeholder");
  const result = el("result");
  const imageEl = el("image");
  const saveBtn = el("save-btn");
  const againBtn = el("again-btn");
  const viewLink = el("view-link");
  const spinner = el("spinner");
  const generateLabel = el("generate-label");
  const generateSpinner = el("generate-spinner");

  const batchOf = window.ImageForgeGenerateBatch;
  const api = window.ImageForgeApi;
  const ui = window.ImageForgeUi;

  if (!batchOf || !api || !ui) return;

  const { batchFrom, picked, saveLabel, waitingFor, missingNote, saveSummary } =
    batchOf;
  const GENERIC_ERR = api.GENERIC_ERR;

  let batch = [];

  let drawnBatch = null;

  let selectedPromptId = (function () {
    const opt = promptSelect.options[promptSelect.selectedIndex];
    return opt ? opt.getAttribute("data-id") || "" : "";
  })();
  let currentPromptId = ""; // id kept for the image that was made

  const show = (node) => ui.show(node, true);
  const hide = (node) => ui.show(node, false);

  /**
   * Show a status message under the button, coloured by kind.
   */
  function setStatus(msg, kind) {
    ui.setStatus(statusEl, msg, kind);
  }

  /**
   * Put the Save button in step with the selection.
   */
  function syncSave() {
    const n = picked(batch).length;
    ui.show(saveBtn, batch.length > 0);
    saveBtn.disabled = n === 0;
    saveBtn.textContent = saveLabel(n);
  }

  /**
   * Put one generation in step with its entry, without replacing it.
   */
  function paintTile(button, item, index) {
    button.setAttribute("aria-checked", String(item.selected));
    button.className =
      "relative block overflow-hidden rounded-lg border-2 bg-white p-1 " +
      (item.selected
        ? "border-brand-600 ring-2 ring-brand-500/40"
        : "border-slate-200 hover:border-slate-300");

    const chip = button.querySelector("[data-model]");
    if (chip) chip.remove();

    if (item.model && item.showModel) {
      const label = document.createElement("span");
      label.setAttribute("data-model", "");
      label.className =
        "absolute inset-x-0 top-0 bg-slate-900/75 px-2 py-1 text-xs font-medium text-white";
      label.textContent = item.model;
      button.appendChild(label);
    }

    const existing = button.querySelector("[data-note]");
    if (existing) existing.remove();

    if (item.note) {
      const note = document.createElement("span");
      note.setAttribute("data-note", "");
      note.className =
        "absolute inset-x-0 bottom-0 bg-slate-900/75 px-2 py-1 text-xs text-white";
      note.textContent = item.note;
      button.appendChild(note);
    }

    button.querySelector("img").src = item.url;
    button.setAttribute("aria-label", "Image " + (index + 1));
  }

  /**
   * Draw one generation for an image in the batch.
   */
  function drawTile(item, index) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "checkbox");

    const img = document.createElement("img");
    img.alt = "Generated image " + (index + 1);
    img.className = "block h-auto w-full rounded";
    button.appendChild(img);

    button.addEventListener("click", function () {
      if (!item.token) return;
      item.selected = !item.selected;
      paintTile(button, item, index);
      syncSave();
    });

    paintTile(button, item, index);
    return button;
  }

  /**
   * Put the grid in step with the batch, repainting where that will do.
   */
  function paintOrRebuild() {
    const drawn = tiles.children;

    if (drawnBatch === batch && drawn.length === batch.length) {
      batch.forEach(function (item, index) {
        paintTile(drawn[index], item, index);
      });
      return;
    }

    tiles.replaceChildren.apply(tiles, batch.map(drawTile));
    drawnBatch = batch;
  }

  /**
   * Show what was generated: one image large, several as a grid.
   */
  function render() {
    if (!batch.length) {
      hide(result);
      hide(grid);
    } else if (batch.length === 1 && !batch[0].showModel) {
      imageEl.src = batch[0].url;
      show(result);
      hide(grid);
    } else {
      paintOrRebuild();
      hide(result);
      show(grid);
    }
    syncSave();
  }

  /**
   * How many images the picker is currently asking for.
   */
  function askedFor() {
    if (compareBox && compareBox.checked) return 2;
    return countSelect ? Number(countSelect.value) || 1 : 1;
  }

  /**
   * Toggle the Generate button between its idle and working states.
   */
  function setGenerating(on) {
    generateBtn.disabled = on;
    if (on) show(generateSpinner);
    else hide(generateSpinner);
    generateLabel.textContent = on ? "Generating" : "Generate";

    if (on && spinnerText) {
      spinnerText.textContent = waitingFor(askedFor());
    }
  }

  function syncCompare() {
    const on = Boolean(compareBox && compareBox.checked);
    if (modelSelect) modelSelect.disabled = on;
    if (countSelect) countSelect.disabled = on;
  }

  if (compareBox) {
    compareBox.addEventListener("change", syncCompare);
    syncCompare();
  }

  promptSelect.addEventListener("change", function () {
    const opt = promptSelect.options[promptSelect.selectedIndex];
    selectedPromptId = opt ? opt.getAttribute("data-id") || "" : "";
    if (promptSelect.value) {
      promptField.value = promptSelect.value;
    }

    const size = opt ? opt.getAttribute("data-size") : "";
    const model = opt ? opt.getAttribute("data-model") : "";
    if (size) sizeSelect.value = size;
    if (model && modelSelect) modelSelect.value = model;
  });

  /**
   * Generate from whatever the form currently holds.
   */
  async function runGenerate() {
    const prompt = (promptField.value || "").trim();
    if (!prompt) {
      setStatus("Enter a prompt first.", "error");
      return;
    }

    batch = [];
    hide(saveBtn);
    hide(againBtn);
    hide(viewLink);
    hide(result);
    hide(grid);
    hide(placeholder);
    show(spinner);
    setGenerating(true);
    setStatus("");

    try {
      const comparing = Boolean(compareBox && compareBox.checked);

      const body = await api.post("/api/generate", {
        prompt: prompt,
        size: sizeSelect.value,
        model: modelSelect ? modelSelect.value : "",
        count: countSelect ? countSelect.value : "1",
        compare: comparing ? "1" : "",
      });

      batch = batchFrom(body.images, comparing);
      currentPromptId = selectedPromptId;
      hide(spinner);
      render();
      show(againBtn);

      const missing = missingNote(body.failed);
      setStatus(missing, missing ? "error" : undefined);
    } catch (err) {
      hide(spinner);
      show(placeholder);
      setStatus(err.message || GENERIC_ERR, "error");
    } finally {
      setGenerating(false);
    }
  }

  generateBtn.addEventListener("click", runGenerate);
  if (againBtn) againBtn.addEventListener("click", runGenerate);

  /**
   * Save every picked image, one call each.
   */
  async function runSave() {
    const chosen = picked(batch);
    if (!chosen.length) return;

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    setStatus("Saving…");

    let saved = 0;
    let failed = 0;

    for (const item of chosen) {
      try {
        const body = await api.post("/api/save", {
          token: item.token,
          prompt_id: currentPromptId || "",
        });
        if (body.url) item.url = body.url;
        item.token = null;
        item.selected = false;
        item.note = "Saved";
        saved += 1;
      } catch (err) {
        item.note = err.message || GENERIC_ERR;
        failed += 1;
      }
    }

    render();

    const said = saveSummary(saved, failed);
    setStatus(said.message, said.kind);
    if (said.viewLink) show(viewLink);
  }

  saveBtn.addEventListener("click", runSave);

  if (typeof window !== "undefined") {
    window.ImageForgeGenerateTest = { runGenerate, runSave };
  }
})();
