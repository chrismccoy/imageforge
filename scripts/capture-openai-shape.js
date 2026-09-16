/**
 * Record the image API's response.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");
const { toFile } = OpenAI;

const FIXTURES = path.join(__dirname, "..", "tests", "e2e", "fixtures");
const MODEL = "gpt-image-1.5";
const SIZE = "1024x1024";

function redact(payload) {
  const copy = JSON.parse(JSON.stringify(payload));
  for (const item of copy.data ?? []) {
    if (item.b64_json) item.b64_json = "<png>";
    if (item.url) item.url = "<url>";
  }
  return copy;
}

function write(name, payload) {
  const file = path.join(FIXTURES, name);
  fs.writeFileSync(file, `${JSON.stringify(redact(payload), null, 2)}\n`);
  console.log(`wrote ${file}`);
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Set OPENAI_API_KEY to record the envelopes.");

  const client = new OpenAI({ apiKey });
  const prompt = "A plain grey square, flat colour, no detail";

  write(
    "openai-generation.json",
    await client.images.generate({ model: MODEL, prompt, n: 1, size: SIZE })
  );

  write(
    "openai-generation-batch.json",
    await client.images.generate({ model: MODEL, prompt, n: 2, size: SIZE })
  );

  const source = await toFile(
    fs.createReadStream(path.join(FIXTURES, "seed-square.png")),
    "seed-square.png",
    { type: "image/png" }
  );
  const mask = await toFile(
    fs.createReadStream(path.join(FIXTURES, "edit-mask.png")),
    "edit-mask.png",
    { type: "image/png" }
  );

  write(
    "openai-edit.json",
    await client.images.edit({
      model: MODEL,
      image: source,
      mask,
      prompt: "Make the centre a plain white circle",
      n: 1,
      size: SIZE,
    })
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
