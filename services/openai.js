/**
 * OpenAI images client
 *
 * Calls the OpenAI image API through the official SDK and returns the picture bytes.
 */

"use strict";

// The client and the helper that wraps bytes for an upload, from one require.
const OpenAI = require("openai");
const { toFile } = OpenAI;

const {
  OPENAI_MODERATION,
  MODELS,
  DEFAULT_OPENAI_MODEL,
} = require("../config/images");
const { env } = require("../config/env");
const { toTrimmedString } = require("../utils/domain/coerce");
const { readUsage } = require("../utils/domain/usage");

/**
 * Turn a UI token ("1.5" or "2") into the full OpenAI model name.
 */
function resolveModel(token) {
  return MODELS[toTrimmedString(token)] || DEFAULT_OPENAI_MODEL;
}

// How much of an unexpected reply to keep in the log.
const BODY_LOG_CHARS = 300;

/**
 * Wrap fetch so a reply that is not JSON is recorded before the SDK breaks
 */
function makeLoggingFetch(inner = fetch, log = console.error) {
  const write = log || console.error;
  return async function loggingFetch(url, init) {
    const started = Date.now();
    const res = await inner(url, init);
    const type = res.headers.get("content-type") || "";

    if (!type.includes("json")) {
      let body = "";
      try {
        body = (await res.clone().text()).slice(0, BODY_LOG_CHARS);
      } catch (err) {
        body = `<unreadable: ${err.message}>`;
      }
      write(
        `Image API replied with a non-JSON body after ${Date.now() - started}ms: ` +
          `status=${res.status} type="${type}" url="${url}" body="${body.replace(/\s+/g, " ").trim()}"`
      );
    }

    return res;
  };
}

/**
 * Turn an error from the image request into something friendly to show a user.
 */
function describeUpstreamError(err) {
  const message = (err && err.message) || "";
  const status = err && err.status;

  if (/is not valid JSON|Unexpected token/i.test(message)) {
    const where = status ? ` (status ${status})` : "";
    return (
      `The image service returned an unreadable response${where}. ` +
      "That usually means a proxy or gateway answered instead of the API. " +
      "Check the server log for the full reply, then try again."
    );
  }

  return message || "The image request failed.";
}

/**
 * Build an OpenAI client. Allows for OPENAI_BASE_URL so the app can point at a
 * another compatible endpoint.
 */
function makeClient(apiKey, { baseUrl = env.OPENAI_BASE_URL, log } = {}) {
  return new OpenAI({
    apiKey,
    baseURL: baseUrl || undefined,
    fetch: makeLoggingFetch(fetch, log),
  });
}

/**
 * Pull the image bytes out of one API result item.
 */
async function extractImageBytes(imageData) {
  if (imageData.b64_json) {
    const bytes = Buffer.from(imageData.b64_json, "base64");
    if (!bytes.length) {
      throw new Error("Could not decode the returned image.");
    }
    return bytes;
  }

  if (imageData.url) {
    const remote = await fetch(imageData.url);
    if (!remote.ok) {
      throw new Error("Could not download the returned image.");
    }
    const bytes = Buffer.from(await remote.arrayBuffer());
    if (!bytes.length) {
      throw new Error("Could not download the returned image.");
    }
    return bytes;
  }

  throw new Error("OpenAI returned no usable image data.");
}

/**
 * Make one image request and return the image.
 */
async function imageRequest({
  prompt,
  size,
  apiKey,
  modelToken,
  client,
  call,
  baseUrl,
  log = console,
}) {
  const key = toTrimmedString(apiKey);
  if (!key) {
    throw new Error(
      "No OpenAI API key is set. Add one on the Settings page or via OPENAI_API_KEY."
    );
  }
  if (!prompt || !prompt.trim()) {
    throw new Error("The prompt is empty.");
  }

  const model = resolveModel(modelToken);
  const api = client || makeClient(key, { baseUrl, log: (m) => log.error(m) });

  let payload;
  try {
    payload = await call(api, model);
  } catch (err) {
    log.error(
      `Image request failed for model ${model} at ${size}:`,
      (err && err.stack) || err
    );
    throw new Error(describeUpstreamError(err));
  }

  const items = payload && Array.isArray(payload.data) ? payload.data : [];
  if (!items.length) {
    throw new Error("OpenAI returned no image.");
  }

  const images = [];
  for (const item of items) {
    const bytes = await extractImageBytes(item);
    images.push({
      bytes,
      dataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
    });
  }

  return { model, usage: readUsage(payload), images };
}

/**
 * Ask OpenAI to make an image and return the bytes.
 */
async function generateImage({
  prompt,
  size,
  apiKey,
  model: modelToken,
  n = 1,
  moderation = OPENAI_MODERATION,
  client,
  baseUrl,
  log,
}) {
  return imageRequest({
    prompt,
    size,
    apiKey,
    modelToken,
    client,
    baseUrl,
    log,
    call: (api, model) =>
      api.images.generate({ model, prompt, n, size, moderation }),
  });
}

/**
 * Ask OpenAI to change part of an image and return the bytes.
 */
async function editImage({
  prompt,
  size,
  apiKey,
  model: modelToken,
  imageBytes,
  maskBytes,
  imageName = "source.png",
  n = 1,
  client,
  baseUrl,
  log,
}) {
  if (!imageBytes || !imageBytes.length || !maskBytes || !maskBytes.length) {
    throw new Error("An edit needs both an image and a mask.");
  }

  const result = await imageRequest({
    prompt,
    size,
    apiKey,
    modelToken,
    client,
    baseUrl,
    log,
    call: async (api, model) =>
      api.images.edit({
        model,
        image: await toFile(imageBytes, imageName, { type: "image/png" }),
        mask: await toFile(maskBytes, "mask.png", { type: "image/png" }),
        prompt,
        n,
        size,
      }),
  });

  const [image] = result.images;
  return {
    model: result.model,
    usage: result.usage,
    bytes: image.bytes,
    dataUrl: image.dataUrl,
  };
}

module.exports = {
  generateImage,
  editImage,
  resolveModel,
  describeUpstreamError,
  makeLoggingFetch,
};
