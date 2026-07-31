/**
 * The screenshot gallery's lightbox
 */

(function () {
  "use strict";

  var box = document.getElementById("lightbox");
  var image = document.getElementById("lb-image");
  var counter = document.getElementById("lb-counter");
  var title = document.getElementById("lb-title");
  var caption = document.getElementById("lb-caption");
  var save = document.getElementById("lb-save");
  var strip = document.getElementById("lb-strip");

  var shots = [].slice
    .call(document.querySelectorAll("figure[data-shot]"))
    .map(function (figure) {
      var link = figure.querySelector("a[href]");
      return {
        href: link.getAttribute("href"),
        title: figure.getAttribute("data-title") || "",
        text: figure.getAttribute("data-text") || "",
        figure: figure,
        link: link,
      };
    });

  if (!box || !shots.length) return;

  var at = 0;
  var opener = null;

  var ACTIVE = "#0071e3";
  var thumbs = shots.map(function (shot, index) {
    var button = document.createElement("button");
    button.type = "button";
    button.className =
      "h-12 w-16 flex-shrink-0 cursor-pointer overflow-hidden rounded-lg " +
      "border-2 border-transparent p-0 transition-all hover:border-white/50";
    button.setAttribute("aria-label", "Screenshot " + (index + 1));

    var thumb = document.createElement("img");
    thumb.src = shot.href;
    thumb.alt = "";
    thumb.loading = "lazy";
    thumb.className = "h-full w-full object-cover object-top";
    button.appendChild(thumb);

    button.addEventListener("click", function () {
      show(index);
    });
    strip.appendChild(button);
    return button;
  });

  function show(index) {
    at = (index + shots.length) % shots.length;
    var shot = shots[at];

    image.src = shot.href;
    image.alt = shot.title;
    save.href = shot.href;
    save.setAttribute("download", shot.href);
    counter.textContent = at + 1 + " / " + shots.length;
    title.textContent = shot.title;
    caption.textContent = shot.text;

    thumbs.forEach(function (button, i) {
      button.style.borderColor = i === at ? ACTIVE : "";
    });

    var active = thumbs[at];
    if (active && active.scrollIntoView) {
      active.scrollIntoView({ inline: "center", block: "nearest" });
    }
  }

  function open(index) {
    opener = document.activeElement;
    box.hidden = false;
    document.body.style.overflow = "hidden";
    show(index);
  }

  function close() {
    box.hidden = true;
    document.body.style.overflow = "";
    if (opener && opener.focus) opener.focus();
    opener = null;
  }

  shots.forEach(function (shot, index) {
    shot.link.addEventListener("click", function (event) {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
        return;
      }
      event.preventDefault();
      open(index);
    });
  });

  document.getElementById("lb-close").addEventListener("click", close);
  document.getElementById("lb-prev").addEventListener("click", function () {
    show(at - 1);
  });
  document.getElementById("lb-next").addEventListener("click", function () {
    show(at + 1);
  });

  box.addEventListener("click", function (event) {
    if (event.target === box) close();
  });

  document.addEventListener("keydown", function (event) {
    if (box.hidden) return;
    if (event.key === "Escape") close();
    else if (event.key === "ArrowRight") show(at + 1);
    else if (event.key === "ArrowLeft") show(at - 1);
  });
})();
