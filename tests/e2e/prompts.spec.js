/**
 * Saved prompts: creating, editing, finding.
 */

"use strict";

const { expect, test } = require("@playwright/test");
const { signIn, field, uniqueName } = require("./support/app");
const { PROMPTS, CATEGORIES, IMAGES } = require("./support/seed");

function rowFor(page, name) {
  return page.locator("[data-prompt-row]").filter({ hasText: name }).first();
}

async function createPrompt(page, { name, text, category, notes }) {
  await page.goto("/prompts/new");
  await field(page, "name").fill(name);
  await field(page, "prompt").fill(text);
  if (category) await field(page, "category_id").selectOption({ label: category });
  if (notes) await field(page, "notes").fill(notes);
  await page.getByRole("button", { name: "Save prompt" }).click();
  await expect(page).toHaveURL(/\/prompts/);
}

async function deletePrompt(page, name) {
  await page.goto("/prompts");
  const row = rowFor(page, name);
  await row.getByRole("button", { name: "Delete" }).click();
  await row.getByRole("button", { name: /^(Delete|Yes)/ }).click();
  await expect(rowFor(page, name)).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("the list holds every saved prompt with its title and text", async ({ page }) => {
  await page.goto("/prompts");

  for (const prompt of Object.values(PROMPTS)) {
    await expect(rowFor(page, prompt.name)).toBeVisible();
  }
  await expect(rowFor(page, PROMPTS.plain.name)).toContainText(PROMPTS.plain.prompt);
});

test("a prompt can be written, edited and deleted again", async ({ page }) => {
  const name = uniqueName("Prompt");

  await createPrompt(page, {
    name,
    text: "A quiet harbour before sunrise",
    category: CATEGORIES.landscapes,
  });
  await expect(rowFor(page, name)).toBeVisible();

  await rowFor(page, name).getByRole("link", { name: "Edit" }).click();
  await field(page, "prompt").fill("A quiet harbour just after sunrise");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(rowFor(page, name)).toContainText("just after sunrise");

  await deletePrompt(page, name);
});

test("the form counts the characters as they are typed", async ({ page }) => {
  await page.goto("/prompts/new");
  await field(page, "prompt").fill("Twelve chars");

  await expect(page.locator("[data-char-count='prompt']")).toHaveText("12 characters");
});

test("duplicating a prompt names the copy after it and saves nothing until told", async ({
  page,
}) => {
  await page.goto("/prompts");
  await rowFor(page, PROMPTS.pinned.name).getByRole("link", { name: "Duplicate" }).click();

  const copyName = await field(page, "name").inputValue();
  expect(copyName).toContain(PROMPTS.pinned.name);
  await expect(field(page, "prompt")).toHaveValue(PROMPTS.pinned.prompt);

  await page.goto("/prompts");
  await expect(rowFor(page, copyName)).toHaveCount(0);

  await page.goto("/prompts");
  await rowFor(page, PROMPTS.pinned.name).getByRole("link", { name: "Duplicate" }).click();
  await page.getByRole("button", { name: "Save prompt" }).click();

  const copy = rowFor(page, copyName);
  await expect(copy).toBeVisible();
  await expect(copy.locator("[data-rating-group]")).toHaveAttribute("data-rating", "");

  await deletePrompt(page, copyName);
});

test("a prompt's own page shows what it has made", async ({ page }) => {
  await page.goto("/prompts");
  await rowFor(page, PROMPTS.plain.name).getByRole("link", { name: "Edit" }).click();

  const made = page.locator("[data-widget='prompt-images']");
  await expect(made).toBeVisible();
  await expect(made.locator(`img[src$="${IMAGES.favourite.filename}"]`)).toBeVisible();

  await expect(page.locator("[data-widget='prompt-rating']")).toBeVisible();
  await expect(page.locator("[data-widget='prompt-pin']")).toBeVisible();
});

test("searching finds a prompt by its title, its text or its note", async ({ page }) => {
  await page.goto("/prompts?q=Coastal");
  await expect(rowFor(page, PROMPTS.plain.name)).toBeVisible();
  await expect(page.locator("[data-prompt-row]")).toHaveCount(1);

  await page.goto("/prompts?q=mist");
  await expect(rowFor(page, PROMPTS.noted.name)).toBeVisible();
  await expect(page.locator("[data-prompt-row]")).toHaveCount(1);

  await page.goto("/prompts?q=autumn");
  await expect(rowFor(page, PROMPTS.noted.name)).toBeVisible();
  await expect(page.locator("[data-prompt-row]")).toHaveCount(1);
});

test("a prompt's image count leads to the images made from it", async ({ page }) => {
  await page.goto("/prompts");
  await rowFor(page, PROMPTS.plain.name).getByRole("link", { name: /^\d+$/ }).click();

  await expect(page).toHaveURL(/\/generations\?prompt=\d+/);
  await expect(
    page.locator(`[data-prompt-show][data-prompt="${IMAGES.favourite.prompt}"]`)
  ).toHaveCount(1);
});
