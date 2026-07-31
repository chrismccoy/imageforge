/**
 * The add and edit prompt form
 */

"use strict";

const { ALLOWED_SIZES, MODEL_TOKENS, MODELS } = require("../../../config/images");
const { field } = require("../../../utils/http/request");

/**
 * Render the add/edit prompt form.
 */
function renderPromptForm(
  res,
  {
    mode,
    action,
    prompt,
    categories = [],
    error = null,
    status = 200,
    madeFrom = null,
    madeFromTotal = 0,
  }
) {
  return res.status(status).render("prompt-form", {
    title: mode === "edit" ? "Edit Prompt" : "Add Prompt",
    active: "prompts",
    mode,
    action,
    prompt,
    categories,
    sizes: ALLOWED_SIZES,
    modelTokens: MODEL_TOKENS,
    modelIds: MODELS,
    error,
    madeFrom,
    madeFromTotal,
  });
}

/**
 * The optional fields as the form posted them.
 */
function fieldsFrom(body) {
  return {
    size: field(body, "default_size"),
    model: field(body, "default_model"),
    notes: field(body, "notes"),
  };
}

module.exports = { renderPromptForm, fieldsFrom };
