/**
 * Upload Sorting
 */
window.ImageForgeUploadSort = (function () {
  "use strict";

  function sortFiles(files, rules) {
    const allowed = rules.allowed || [];
    const maxBytes = rules.maxBytes || 0;
    const maxFiles = rules.maxFiles || 0;
    const readable = rules.readableBytes || String;

    const accepted = [];
    const refused = [];

    Array.prototype.forEach.call(files || [], function (file) {
      if (allowed.length && allowed.indexOf(file.type) === -1) {
        refused.push({
          name: file.name,
          reason: "Not a PNG, JPEG, or WebP image.",
        });
        return;
      }
      if (maxBytes && file.size > maxBytes) {
        refused.push({
          name: file.name,
          reason: "Larger than " + readable(maxBytes) + ".",
        });
        return;
      }
      if (maxFiles && accepted.length >= maxFiles) {
        refused.push({
          name: file.name,
          reason: "Only " + maxFiles + " at a time.",
        });
        return;
      }
      accepted.push(file);
    });

    return { accepted: accepted, refused: refused };
  }

  return { sortFiles: sortFiles };
})();
