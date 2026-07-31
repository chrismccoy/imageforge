/**
 * Cross model operations
 */

"use strict";

const { buildImportPrompts } = require("./importPrompts");

/**
 * Build the operations over an open connection and the models on it.
 */
function buildOperations(db, models) {
  const { Generation, Prompt, Collection } = models;

  /**
   * Move several images to the trash together, reporting how many moved.
   */
  const trashImages = db.transaction((ids) => {
    return ids.filter((id) => Generation.trash(id)).length;
  });

  /**
   * Destroy one image's row and its collection memberships. Reports whether
   * there was a row to destroy.
   */
  const purgeImage = db.transaction((id) => {
    Collection.clearImage(id);
    return Generation.purge(id);
  });

  /**
   * Delete a prompt and detach the images made from it. Reports whether there
   * was a prompt to delete.
   */
  const deletePrompt = db.transaction((id) => {
    Generation.clearPromptRef(id);
    return Prompt.remove(id);
  });

  /**
   * The same detaching rule applied to a whole selection in one go, reporting
   * how many prompts went.
   */
  const deletePrompts = db.transaction((ids) => {
    return ids.filter((id) => {
      Generation.clearPromptRef(id);
      return Prompt.remove(id);
    }).length;
  });

  return {
    trashImages,
    purgeImage,
    deletePrompt,
    deletePrompts,
    importPrompts: buildImportPrompts(db, models),
  };
}

module.exports = { buildOperations };
