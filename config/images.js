/**
 * Image options
 */

"use strict";

const { toTrimmedString } = require("../utils/domain/coerce");

// Image models, keyed by the short token shown in the UI.
const MODELS = {
  1.5: "gpt-image-1.5",
  2: "gpt-image-2",
};

const MODEL_TOKENS = ["1.5", "2"];

const MODEL_BY_ID = Object.fromEntries(
  Object.entries(MODELS).map(([token, id]) => [id, token])
);
const DEFAULT_MODEL = "1.5";
const DEFAULT_OPENAI_MODEL = MODELS[DEFAULT_MODEL];

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

module.exports = {
  MODELS,
  MODEL_TOKENS,
  MODEL_BY_ID,
  DEFAULT_MODEL,
  DEFAULT_OPENAI_MODEL,
  ALLOWED_SIZES,
  DEFAULT_SIZE,
  ALLOWED_COUNTS,
  DEFAULT_COUNT,
  OPENAI_MODERATION,
  normalizeModel,
  normalizeSize,
  normalizeCount,
  pickerModel,
};
