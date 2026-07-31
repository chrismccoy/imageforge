/**
 * Prompt transfer
 */

"use strict";

const VERSION = 1;

const MAX_ENTRIES = 1000;

/**
 * A trimmed string, or an empty one for anything that is not a string.
 */
function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * A rating from one to five, or null.
 */
function rating(value) {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 5
    ? value
    : null;
}

/**
 * Every saved prompt as a file.
 */
function toExport(rows, nowIso) {
  return {
    version: VERSION,
    exported_at: nowIso,
    prompts: rows.map((row) => ({
      name: row.name,
      prompt: row.prompt,
      category: text(row.category_name) || null,
      rating: rating(row.rating),
      default_size: text(row.default_size) || null,
      default_model: text(row.default_model) || null,
      notes: text(row.notes) || null,
    })),
  };
}

/**
 * The prompts in a file, or a reason the file cannot be used.
 */
function parseImport(source) {
  let data;
  try {
    data = JSON.parse(source);
  } catch (err) {
    return { error: "That file is not JSON." };
  }

  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object"
      ? data.prompts
      : null;

  if (!Array.isArray(list)) {
    return { error: "That file has no list of prompts in it." };
  }

  if (list.length > MAX_ENTRIES) {
    return {
      error: `That file holds more than ${MAX_ENTRIES} prompts. Split it and import the parts.`,
    };
  }

  const entries = [];
  let ignored = 0;

  for (const raw of list) {
    const name = text(raw && raw.name);
    const prompt = text(raw && raw.prompt);

    if (!name || !prompt) {
      ignored += 1;
      continue;
    }

    entries.push({
      name,
      prompt,
      category: text(raw.category) || null,
      rating: rating(raw.rating),
      defaultSize: text(raw.default_size) || null,
      defaultModel: text(raw.default_model) || null,
      notes: text(raw.notes) || null,
    });
  }

  return { entries, ignored };
}

module.exports = { toExport, parseImport, VERSION, MAX_ENTRIES };
