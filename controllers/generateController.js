/**
 * Generate controller
 */

"use strict";

const { generateImage } = require("../services/openai");
const { problem } = require("../utils/http/http");
const {
  ALLOWED_SIZES,
  ALLOWED_COUNTS,
  DEFAULT_COUNT,
  normalizeSize,
  normalizeModel,
  normalizeCount,
  pickerModel,
  MODEL_TOKENS,
  MODELS,
} = require("../config/images");
const { sizeFrom, field } = require("../utils/http/request");
const { parseId } = require("../utils/domain/coerce");
const { splitUsage } = require("../utils/domain/usage");
const { requireDeps } = require("./support/helpers/requireDeps");

/**
 * Build the generate controller
 */
module.exports = (deps) => {
  const {
    models,
    openaiCredentials,
    pending,
    log = console,
  } = requireDeps(
    deps,
    ["models", "openaiCredentials", "pending"],
    "generateController"
  );
  const { Prompt, Generation, Spend } = models;

  /**
   * One image from a model, held for saving.
   */
  async function oneFrom({ modelToken, prompt, size, log }) {
    const result = await generateImage({
      prompt,
      size,
      apiKey: openaiCredentials.apiKey(),
      model: modelToken,
      n: 1,
      log,
    });

    Spend.recordGenerated({
      model: result.model,
      usage: result.usage,
      images: result.images.length,
    });

    const image = result.images[0];
    return {
      token: pending.put(image.bytes, {
        prompt,
        size,
        model: result.model,
        usage: result.usage,
      }),
      url: image.dataUrl,
      model: result.model,
    };
  }

  /**
   * Ask every model the same thing, and answer with whatever came back.
   */
  async function compareModels({ res, prompt, size, log }) {
    const answers = await Promise.allSettled(
      MODEL_TOKENS.map((modelToken) => oneFrom({ modelToken, prompt, size, log }))
    );

    const images = [];
    const failed = [];

    answers.forEach((answer, at) => {
      if (answer.status === "fulfilled") {
        images.push(answer.value);
        return;
      }
      failed.push({
        model: MODELS[MODEL_TOKENS[at]],
        message: (answer.reason && answer.reason.message) || "It failed.",
      });
    });

    if (!images.length) {
      return problem(
        res,
        400,
        failed.map((one) => `${one.model}: ${one.message}`).join(" ")
      );
    }

    return res.json({ images, failed });
  }

  return {
    /**
     * Render the Generate page with the saved prompts, sizes, and current model.
     */
    showGenerate(req, res) {
      const settings = req.settings;

      const from = parseId(field(req.query, "from"));
      const source = from ? Generation.get(from) : null;

      res.render("generate", {
        title: "Generate Image",
        active: "generate",
        prompts: Prompt.all(),
        sizes: ALLOWED_SIZES,
        counts: ALLOWED_COUNTS,
        defaultCount: DEFAULT_COUNT,
        defaultSize: normalizeSize(source && source.size, settings.default_size),
        modelTokens: MODEL_TOKENS,
        modelIds: MODELS,
        selectedModel: pickerModel(
          source && source.model,
          openaiCredentials.model()
        ),
        startingPrompt: source ? source.prompt : "",
        fromPromptId: source ? source.prompt_id : null,
        hasKey: Boolean(openaiCredentials.apiKey()),
      });
    },

    /**
     * Make images from the posted prompt and size. The bytes are kept server
     * side under a token each; the data URLs are returned only for preview.
     */
    async generate(req, res) {
      const prompt = field(req.body, "prompt");
      if (!prompt) {
        return problem(res, 400, "The prompt is empty.");
      }

      const size = sizeFrom(req.body, req.settings.default_size);

      const model = normalizeModel(
        field(req.body, "model"),
        openaiCredentials.model()
      );

      const count = normalizeCount(field(req.body, "count"));

      const comparing = Boolean(field(req.body, "compare"));

      try {
        if (comparing) {
          return await compareModels({ res, prompt, size, log });
        }

        const result = await generateImage({
          prompt,
          size,
          apiKey: openaiCredentials.apiKey(),
          model,
          n: count,
          log,
        });

        Spend.recordGenerated({
          model: result.model,
          usage: result.usage,
          images: result.images.length,
        });

        const shares = splitUsage(result.usage, result.images.length);

        const images = result.images.map((image, index) => ({
          token: pending.put(image.bytes, {
            prompt,
            size,
            model: result.model,
            usage: shares[index],
          }),
          url: image.dataUrl,
          model: result.model,
        }));

        res.json({ images });
      } catch (err) {
        problem(res, 400, err.message || "Something went wrong.");
      }
    },
  };
};
