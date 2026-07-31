/**
 * OpenAI credentials
 */

"use strict";

const { env } = require("../config/env");
const { DEFAULT_MODEL } = require("../config/images");
const { toTrimmedString } = require("../utils/domain/coerce");

/**
 * Build the credentials over a settings model.
 */
function createOpenaiCredentials(settings, { settings: envValues = env } = {}) {
  /**
   * The API key from the environment
   */
  function envKey() {
    return envValues.OPENAI_API_KEY;
  }

  /**
   * Whether the environment is supplying a fallback key.
   */
  function apiKeyFromEnv() {
    return envKey() !== "";
  }

  /**
   * The key to use for a request: the saved key first, then the environment key.
   */
  function apiKey() {
    return toTrimmedString(settings.get().api_key) || envKey();
  }

  /**
   * The model token to use for a request.
   */
  function model() {
    return toTrimmedString(settings.get().model) || DEFAULT_MODEL;
  }

  return { apiKey, apiKeyFromEnv, model, envKey };
}

module.exports = { createOpenaiCredentials };
