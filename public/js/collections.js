/**
 * Image collections
 */
(function () {
  const api = window.ImageForgeApi;

  if (!api) return;

  document.querySelectorAll("[data-collections]").forEach(function (box) {
    const id = box.getAttribute("data-gen-id");
    const chips = box.querySelector("[data-collection-chips]");
    const picker = box.querySelector("[data-collection-add]");

    function paint(collections) {
      chips.textContent = "";

      collections.forEach(function (collection) {
        const chip = document.createElement("span");
        chip.setAttribute("data-collection-chip", "");
        chip.setAttribute("data-collection-id", String(collection.id));
        chip.className =
          "inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600";
        chip.textContent = collection.name;

        const cross = document.createElement("button");
        cross.type = "button";
        cross.setAttribute("data-collection-remove", "");
        cross.setAttribute("aria-label", "Take out of " + collection.name);
        cross.className = "text-slate-400 hover:text-red-600";
        cross.textContent = "×";
        chip.appendChild(cross);

        chips.appendChild(chip);
      });
    }

    async function send(path) {
      try {
        const body = await api.post(path);
        paint(body.collections);
      } catch (err) {
        api.notice(err.message || "Could not change the collection.");
      }
    }

    if (picker) {
      picker.addEventListener("change", function () {
        if (!picker.value) return;
        send("/generations/" + id + "/collections/" + picker.value);
        picker.value = "";
      });
    }

    chips.addEventListener("click", function (event) {
      const cross = event.target.closest("[data-collection-remove]");
      if (!cross) return;

      const chip = cross.closest("[data-collection-chip]");
      send(
        "/generations/" +
          id +
          "/collections/" +
          chip.getAttribute("data-collection-id") +
          "/remove"
      );
    });
  });
})();
