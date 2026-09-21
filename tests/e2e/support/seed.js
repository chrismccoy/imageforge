/**
 * What the seed puts in the throwaway install.
 */

"use strict";

const CATEGORIES = {
  landscapes: "Landscapes",
  portraits: "Portraits",
};

const PROMPTS = {
  plain: {
    name: "Coastal cliffs",
    prompt: "A wide shot of coastal cliffs under a clear sky",
    category: CATEGORIES.landscapes,
    rating: 3,
    pinned: 0,
    size: "1536x1024",
    model: "1.5",
    notes: "",
  },
  variables: {
    name: "City mood",
    prompt: "A street in {city} at dusk, feeling [mood]",
    category: CATEGORIES.portraits,
    rating: null,
    pinned: 0,
    size: "1024x1024",
    model: "1.5",
    notes: "",
  },
  pinned: {
    name: "Studio portrait",
    prompt: "A studio portrait on a plain grey background, soft light",
    category: CATEGORIES.portraits,
    rating: 5,
    pinned: 1,
    size: "1024x1536",
    model: "2",
    notes: "",
  },
  noted: {
    name: "Orchard at dawn",
    prompt: "An orchard at dawn with low mist between the rows",
    category: null,
    rating: 2,
    pinned: 0,
    size: "1024x1024",
    model: "1.5",
    notes: "Reference for the autumn set",
  },
};

const SHARED_TOKEN = "k3f9Qa72vXe1";

const IMAGES = {
  favourite: {
    filename: "e2e-favourite.png",
    fixture: "seed-square.png",
    prompt: PROMPTS.plain.prompt,
    promptName: PROMPTS.plain.name,
    model: "gpt-image-1.5",
    size: "1024x1024",
    favorite: 1,
    shareToken: null,
    usage: { total: 1200, input: 200, output: 1000 },
  },
  shared: {
    filename: "e2e-shared.png",
    fixture: "seed-landscape.png",
    prompt: PROMPTS.noted.prompt,
    promptName: PROMPTS.noted.name,
    model: "gpt-image-1.5",
    size: "1536x1024",
    favorite: 0,
    shareToken: SHARED_TOKEN,
    usage: { total: 1500, input: 250, output: 1250 },
  },
  collected: {
    filename: "e2e-collected.png",
    fixture: "seed-portrait.png",
    prompt: PROMPTS.pinned.prompt,
    promptName: PROMPTS.pinned.name,
    model: "gpt-image-2",
    size: "1024x1536",
    favorite: 0,
    shareToken: null,
    usage: { total: 1800, input: 300, output: 1500 },
  },
};

const TRASHED = {
  filename: "e2e-trashed.png",
  fixture: "seed-square.png",
  prompt: PROMPTS.variables.prompt,
  model: "gpt-image-1.5",
  size: "1024x1024",
};

const COLLECTION = {
  name: "Client work",
  publicTitle: "Selected work",
  contains: [IMAGES.collected.filename],
};

const PRICES = {
  "gpt-image-1.5": { input: 5, output: 40 },
  "gpt-image-2": { input: 10, output: 80 },
};

const PAGE_SIZE = 24;

const LIVE_IMAGE_COUNT = Object.keys(IMAGES).length;
const PROMPT_COUNT = Object.keys(PROMPTS).length;

module.exports = {
  CATEGORIES,
  PROMPTS,
  IMAGES,
  TRASHED,
  COLLECTION,
  PRICES,
  PAGE_SIZE,
  SHARED_TOKEN,
  LIVE_IMAGE_COUNT,
  PROMPT_COUNT,
};
