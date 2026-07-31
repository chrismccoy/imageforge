/**
 * A batch of generated images
 */
window.ImageForgeGenerateBatch = (function () {
  "use strict";

  /**
   * The entries the grid is generated from, for what a generate call answered.
   */
  function batchFrom(images, comparing) {
    return (images || []).map(function (image) {
      return {
        token: image.token,
        url: image.url,
        model: image.model,
        showModel: Boolean(comparing),
        selected: images.length === 1,
        note: "",
      };
    });
  }

  /**
   * The entries that are picked and still saveable.
   */
  function picked(batch) {
    return batch.filter(function (item) {
      return item.selected && item.token;
    });
  }

  /**
   * What the Save button reads.
   */
  function saveLabel(count) {
    return count > 1 ? "Save " + count + " selected" : "Save";
  }

  /**
   * What the spinner says while a request is out.
   */
  function waitingFor(count) {
    return count > 1
      ? "Generating your " + count + " images"
      : "Generating your image";
  }

  /**
   * What to say about the models that did not answer.
   */
  function missingNote(failed) {
    return (failed || [])
      .map(function (one) {
        return one.model + " did not answer.";
      })
      .join(" ");
  }

  /**
   * What to say once a save has been through the batch.
   */
  function saveSummary(saved, failed) {
    if (failed && saved) {
      return {
        message: "Saved " + saved + ". " + failed + " could not be saved.",
        kind: "error",
        viewLink: true,
      };
    }
    if (failed) {
      return { message: "Nothing could be saved.", kind: "error", viewLink: false };
    }
    return {
      message: saved > 1 ? "Saved " + saved + " images." : "Saved.",
      kind: "success",
      viewLink: true,
    };
  }

  return {
    batchFrom: batchFrom,
    picked: picked,
    saveLabel: saveLabel,
    waitingFor: waitingFor,
    missingNote: missingNote,
    saveSummary: saveSummary,
  };
})();
