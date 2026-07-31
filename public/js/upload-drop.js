/**
 * Drag and drop upload
 */
(function () {
  const sort = window.ImageForgeUploadSort;
  const ui = window.ImageForgeUi;
  if (!sort || !ui) return;

  const sortFiles = sort.sortFiles;

  const field = document.querySelector("[data-drop-field]");
  if (!field) return;

  const show = ui.show;
  const input = field.querySelector('input[type="file"]');
  const plain = field.querySelector("[data-drop-plain]");
  const zone = field.querySelector("[data-drop-zone]");
  if (!input || !plain || !zone) return;

  try {
    new DataTransfer();
  } catch (err) {
    return;
  }

  const preview = field.querySelector("[data-drop-preview]");
  const list = field.querySelector("[data-drop-list]");
  const errorOut = field.querySelector("[data-drop-error]");

  const rules = {
    allowed: (input.accept || "")
      .split(",")
      .map(function (type) {
        return type.trim();
      })
      .filter(Boolean),
    maxBytes: Number(field.getAttribute("data-max-bytes")) || 0,
    maxFiles: Number(field.getAttribute("data-max-files")) || 0,
    readableBytes: ui.readableBytes,
  };

  let objectUrls = [];
  let depth = 0;

  /**
   * Say why some files were refused, or clear the message.
   */
  function complain(refused) {
    if (!errorOut) return;
    errorOut.textContent = (refused || [])
      .map(function (item) {
        return item.name + ": " + item.reason;
      })
      .join(" ");
    show(errorOut, Boolean(refused && refused.length));
  }

  /**
   * Drop every thumbnail and release the URLs behind them.
   */
  function clearPreview() {
    objectUrls.forEach(URL.revokeObjectURL);
    objectUrls = [];
    if (list) list.textContent = "";
    if (!preview) return;
    show(preview, false);
  }

  /**
   * One row in the preview: thumbnail, name, size.
   */
  function drawRow(file) {
    const row = document.createElement("li");
    row.className = "flex items-center gap-3 px-3 py-2";

    const url = URL.createObjectURL(file);
    objectUrls.push(url);

    const thumb = document.createElement("img");
    thumb.alt = "";
    thumb.src = url;
    thumb.className = "h-10 w-10 shrink-0 rounded object-cover";

    const name = document.createElement("span");
    name.className = "min-w-0 flex-1 truncate text-sm text-slate-700";
    name.textContent = file.name;

    const size = document.createElement("span");
    size.className = "whitespace-nowrap text-xs text-slate-500";
    size.textContent = ui.readableBytes(file.size);

    row.appendChild(thumb);
    row.appendChild(name);
    row.appendChild(size);
    return row;
  }

  /**
   * Show what is going to be uploaded.
   */
  function showPreview(files) {
    clearPreview();
    if (!files.length || !list || !preview) return;

    files.forEach(function (file) {
      list.appendChild(drawRow(file));
    });
    show(preview, true);
  }

  /**
   * Put the files the page will send into the form's input.
   */
  function accept(files) {
    const sorted = sortFiles(files, rules);
    complain(sorted.refused);

    const carrier = new DataTransfer();
    sorted.accepted.forEach(function (file) {
      carrier.items.add(file);
    });
    input.files = carrier.files;

    showPreview(sorted.accepted);
  }

  /**
   * Turn the zone's border on or off while a file is over it.
   */
  function highlight(on) {
    zone.classList.toggle("border-brand-500", on);
    zone.classList.toggle("bg-brand-50", on);
  }

  zone.addEventListener("click", function () {
    input.click();
  });

  input.addEventListener("change", function () {
    const chosen = Array.prototype.slice.call(input.files || []);
    const sorted = sortFiles(chosen, rules);
    complain(sorted.refused);

    if (sorted.refused.length) {
      const carrier = new DataTransfer();
      sorted.accepted.forEach(function (file) {
        carrier.items.add(file);
      });
      input.files = carrier.files;
    }

    showPreview(sorted.accepted);
  });

  ["dragenter", "dragover"].forEach(function (name) {
    zone.addEventListener(name, function (event) {
      event.preventDefault();
      if (name === "dragenter") depth += 1;
      highlight(true);
    });
  });

  zone.addEventListener("dragleave", function () {
    depth -= 1;
    if (depth <= 0) {
      depth = 0;
      highlight(false);
    }
  });

  zone.addEventListener("drop", function (event) {
    event.preventDefault();
    depth = 0;
    highlight(false);

    const files = event.dataTransfer && event.dataTransfer.files;
    if (files && files.length) accept(files);
  });

  show(plain, false);
  show(zone, true);
})();
