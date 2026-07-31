/**
 * Importing a file of prompts
 */

"use strict";

/**
 * Build the import operation over an open connection and the models on it.
 */
function buildImportPrompts(db, { Prompt, Category }) {
  /**
   * Store a file's of prompts, creating any categories they name.
   */
  return db.transaction((entries, nowIso) => {
    const taken = new Set(Prompt.all().map((p) => p.name.toLowerCase()));
    const categories = new Map(
      Category.all().map((c) => [c.name.toLowerCase(), c.id])
    );

    const result = { imported: 0, skipped: [], created: [] };

    /**
     * The id of the category an entry names, creating it when it is new.
     */
    function categoryFor(entry) {
      if (!entry.category) return null;

      const key = entry.category.toLowerCase();
      if (!categories.has(key)) {
        const made = Category.add(entry.category, nowIso);
        if (made) {
          categories.set(key, made);
          result.created.push(entry.category);
        }
      }
      return categories.get(key) || null;
    }

    for (const entry of entries) {
      if (taken.has(entry.name.toLowerCase())) {
        result.skipped.push(entry.name);
        continue;
      }

      const added = Prompt.add(entry.name, entry.prompt, categoryFor(entry), {
        size: entry.defaultSize,
        model: entry.defaultModel,
        notes: entry.notes,
      });
      if (entry.rating) {
        Prompt.setRating(added, entry.rating);
      }

      taken.add(entry.name.toLowerCase());
      result.imported += 1;
    }

    return result;
  });
}

module.exports = { buildImportPrompts };
