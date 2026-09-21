/**
 * A fake image API.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const SIZE_FIXTURES = {
  "1024x1024": "seed-square.png",
  "1024x1536": "seed-portrait.png",
  "1536x1024": "seed-landscape.png",
  auto: "seed-square.png",
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function asJson(body) {
  try {
    return JSON.parse(body.toString("utf8")) || {};
  } catch {
    return {};
  }
}

function multipartFields(body, contentType) {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType || "");
  if (!boundary) return null;

  const marker = `--${boundary[1] || boundary[2]}`;
  const fields = {};

  for (const part of body.toString("latin1").split(marker)) {
    const header = /name="([^"]+)"/.exec(part);
    if (!header) continue;
    const start = part.indexOf("\r\n\r\n");
    if (start === -1) continue;
    const value = part.slice(start + 4).replace(/\r\n$/, "");
    fields[header[1]] = { length: value.length, value };
  }

  return fields;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendError(res, status, message) {
  sendJson(res, status, {
    error: { message, type: "stub_error", code: null, param: null },
  });
}

function createStub({ fixturesDir }) {
  const envelope = (name) =>
    JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));

  const generation = envelope("openai-generation.json");
  const batch = envelope("openai-generation-batch.json");
  const edit = envelope("openai-edit.json");

  const bytesFor = (size) =>
    fs
      .readFileSync(
        path.join(fixturesDir, SIZE_FIXTURES[size] || SIZE_FIXTURES.auto)
      )
      .toString("base64");

  const requests = [];
  let armed = null;

  function reply(recorded, { n, size }) {
    const template = recorded.data[0];
    const image = bytesFor(size);
    return {
      ...recorded,
      size: SIZE_FIXTURES[size] ? size : recorded.size,
      data: Array.from({ length: n }, () => ({ ...template, b64_json: image })),
    };
  }

  function failureFor(model) {
    if (!armed) return null;
    if (armed.model && armed.model !== model) return null;
    const failure = armed;
    armed = null;
    return failure;
  }

  async function handler(req, res) {
    const url = new URL(req.url, "http://stub.invalid");
    const body = await readBody(req);

    if (url.pathname === "/__stub/health") return sendJson(res, 200, { ok: true });

    if (url.pathname === "/__stub/requests") return sendJson(res, 200, requests);

    if (url.pathname === "/__stub/reset") {
      requests.length = 0;
      armed = null;
      return sendJson(res, 200, { ok: true });
    }

    if (url.pathname === "/__stub/fail-next") {
      const asked = asJson(body);
      armed = { status: asked.status || 500, model: asked.model || null };
      return sendJson(res, 200, { armed });
    }

    if (url.pathname === "/v1/images/generations") {
      const asked = asJson(body);
      const n = Number(asked.n) || 1;
      const size = asked.size || "auto";
      requests.push({
        path: url.pathname,
        model: asked.model,
        n,
        size,
        prompt: asked.prompt,
      });

      const failure = failureFor(asked.model);
      if (failure) return sendError(res, failure.status, "The image request failed.");

      const recorded = n > 1 && batch.data.length > 1 ? batch : generation;
      return sendJson(res, 200, reply(recorded, { n, size }));
    }

    if (url.pathname === "/v1/images/edits") {
      const fields = multipartFields(body, req.headers["content-type"]);
      if (!fields) {
        return sendError(res, 400, "An edit must be sent as multipart/form-data.");
      }

      const size = fields.size?.value || "auto";
      const model = fields.model?.value;
      const n = Number(fields.n?.value) || 1;
      requests.push({
        path: url.pathname,
        model,
        n,
        size,
        prompt: fields.prompt?.value,
        hasMask: Boolean(fields.mask && fields.mask.length),
      });

      if (!fields.image || !fields.image.length) {
        return sendError(res, 400, "An edit must carry an image.");
      }

      const failure = failureFor(model);
      if (failure) return sendError(res, failure.status, "The edit request failed.");

      return sendJson(res, 200, reply(edit, { n, size }));
    }

    return sendError(res, 404, `The stub has no route for ${url.pathname}.`);
  }

  return {
    handler,
    requests,
    reset: () => {
      requests.length = 0;
      armed = null;
    },
    failNext: (failure) => {
      armed = { status: failure.status || 500, model: failure.model || null };
    },
  };
}

module.exports = { createStub };
