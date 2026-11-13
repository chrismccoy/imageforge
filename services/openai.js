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
const { sniffImageType } = require("../utils/files/imageType");

/**
 * Turn a UI token ("2" or "2.6-flare") into the full OpenAI model name.
 */
function resolveModel(token) {
  return MODELS[toTrimmedString(token)] || DEFAULT_OPENAI_MODEL;
}

// How much of an unexpected reply to keep in the log.
const BODY_LOG_CHARS = 300;

// Limits on fetching an image the API returned by URL.
const IMAGE_FETCH_TIMEOUT_MS = 60 * 1000;
const IMAGE_FETCH_MAX_BYTES = 64 * 1024 * 1024;

/**
 * An error whose message is safe to show, with the status to show it under.
 */
function shownError(message, status) {
  return Object.assign(new Error(message), { status, expose: true });
}

/**
 * The status to answer with when the image API itself failed.
 */
function upstreamStatus(err) {
  return err && err.status === 429 ? 503 : 502;
}

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

  if (status === 429) {
    const code = err.code || "";
    if (code === "insufficient_quota" || /credits|quota|billing/i.test(message)) {
      return "You are out of credits, please add funds to continue generating images";
    }
    return "OpenAI is limiting requests right now. Wait a moment and try again.";
  }

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
    const bytes = await downloadImage(imageData.url);
    if (!bytes.length) {
      throw new Error("Could not download the returned image.");
    }
    return bytes;
  }

  throw new Error("OpenAI returned no usable image data.");
}

/**
 * Fetch an image by URL, giving up when it is too slow or too large.
 */
async function downloadImage(url) {
  const failed = new Error("Could not download the returned image.");
  const tooLarge = new Error("The returned image is too large.");
  try {
    const remote = await fetch(url, {
      signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
    });
    if (!remote.ok) throw failed;
    if (Number(remote.headers.get("content-length")) > IMAGE_FETCH_MAX_BYTES) {
      throw tooLarge;
    }
    if (!remote.body) return Buffer.alloc(0);

    const chunks = [];
    let total = 0;
    for await (const chunk of remote.body) {
      total += chunk.length;
      if (total > IMAGE_FETCH_MAX_BYTES) throw tooLarge;
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch (err) {
    if (err === tooLarge || err === failed) throw err;
    if (err && err.name === "TimeoutError") {
      throw new Error("The returned image took too long to download.");
    }
    throw failed;
  }
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
    throw shownError(
      "No OpenAI API key is set. Add one on the Settings page or via OPENAI_API_KEY.",
      400
    );
  }
  if (!prompt || !prompt.trim()) {
    throw shownError("The prompt is empty.", 400);
  }

  const model = resolveModel(modelToken);
  const api = client || makeClient(key, { baseUrl, log: (m) => log.error(m) });

  let payload;
  const started = performance.now();
  try {
    payload = await call(api, model);
  } catch (err) {
    log.error(
      `Image request failed for model ${model} at ${size}:`,
      (err && err.stack) || err
    );
    throw shownError(describeUpstreamError(err), upstreamStatus(err));
  }
  const durationMs = Math.round(performance.now() - started);

  const items = payload && Array.isArray(payload.data) ? payload.data : [];
  if (!items.length) {
    throw shownError("OpenAI returned no image.", 502);
  }

  const images = [];
  for (const item of items) {
    let bytes;
    try {
      bytes = await extractImageBytes(item);
    } catch (err) {
      log.error("Could not read the returned image:", (err && err.stack) || err);
      throw shownError(err.message, 502);
    }
    const kind = sniffImageType(bytes);
    images.push({
      bytes,
      dataUrl: `data:${kind ? kind.mime : "image/png"};base64,${bytes.toString("base64")}`,
    });
  }

  return { model, usage: readUsage(payload), images, durationMs };
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
    throw shownError("An edit needs both an image and a mask.", 400);
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
    durationMs: result.durationMs,
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
  IMAGE_FETCH_MAX_BYTES,
};
