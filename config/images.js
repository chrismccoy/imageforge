/**
 * Image options
 */

"use strict";

const { toTrimmedString } = require("../utils/domain/coerce");

// Image models, keyed by the short token shown in the UI.
const MODELS = {
  2: "gpt-image-2",
  "2.6-sunburst": "gpt-image-2.6-sunburst",
  "2.6-flare": "gpt-image-2.6-flare",
};

const MODEL_TOKENS = ["2", "2.6-sunburst", "2.6-flare"];

const MODEL_BY_ID = Object.fromEntries(
  Object.entries(MODELS).map(([token, id]) => [id, token])
);
const DEFAULT_MODEL = "2.6-sunburst";
const DEFAULT_OPENAI_MODEL = MODELS[DEFAULT_MODEL];
const DEFAULT_EDIT_MODEL = "2.6-sunburst";

// One image per model, plus a second from the selected one: the 2x2 grid.
const COMPARE_IMAGES = MODEL_TOKENS.length + 1;

// Image sizes the API accepts.
const ALLOWED_SIZES = ["1024x1024", "1024x1536", "1536x1024", "auto"];
const DEFAULT_SIZE = "1024x1024";

// How many images one generation may ask for. A short list rather than a range:
const ALLOWED_COUNTS = [1, 2, 4];
const DEFAULT_COUNT = 1;

// OpenAI request settings. The endpoint itself is not stated here: the SDK
// builds it from env.OPENAI_BASE_URL, which config/env.js handles.
const OPENAI_MODERATION = "low";

/**
 * Force a model token to one the app knows, else the fallback.
 */
function normalizeModel(token, fallback = DEFAULT_MODEL) {
  const cleaned = toTrimmedString(token);
  return MODEL_TOKENS.includes(cleaned) ? cleaned : fallback;
}

/**
 * Force a size to one the API accepts, else the fallback.
 */
function normalizeSize(size, fallback = DEFAULT_SIZE) {
  const cleaned = toTrimmedString(size);
  return ALLOWED_SIZES.includes(cleaned) ? cleaned : fallback;
}

/**
 * Force a requested count to one the app offers, else the fallback.
 */
function normalizeCount(value, fallback = DEFAULT_COUNT) {
  const asked = Number(toTrimmedString(value));
  return ALLOWED_COUNTS.includes(asked) ? asked : fallback;
}

/**
 * The picker's token for an image that recorded a model's full name.
 */
function pickerModel(modelId, fallback) {
  return normalizeModel(MODEL_BY_ID[toTrimmedString(modelId)], fallback);
}

/**
 * What a compare asks for: every model once, and the selected one twice.
 */
function compareLineup(selected) {
  const doubled = normalizeModel(selected);
  return MODEL_TOKENS.flatMap((token) =>
    token === doubled
      ? [
          { token, label: `${MODELS[token]} #1` },
          { token, label: `${MODELS[token]} #2` },
        ]
      : [{ token, label: MODELS[token] }]
  );
}

module.exports = {
  MODELS,
  MODEL_TOKENS,
  MODEL_BY_ID,
  DEFAULT_MODEL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_EDIT_MODEL,
  COMPARE_IMAGES,
  ALLOWED_SIZES,
  DEFAULT_SIZE,
  ALLOWED_COUNTS,
  DEFAULT_COUNT,
  OPENAI_MODERATION,
  normalizeModel,
  normalizeSize,
  normalizeCount,
  pickerModel,
  compareLineup,
};
