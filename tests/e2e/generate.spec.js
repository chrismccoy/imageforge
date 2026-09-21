/**
 * Generating an image.
 */

"use strict";

const { expect, test } = require("@playwright/test");
const {
  signIn,
  resetStub,
  stubRequests,
  cardFor,
  modelRadio,
  pickModel,
} = require("./support/app");
const { PROMPTS, IMAGES } = require("./support/seed");

const CITY_PROMPT = PROMPTS.variables.prompt;

test.beforeEach(async ({ page, request }) => {
  await resetStub(request);
  await signIn(page);
  await page.goto("/generate");
});

test("the picker offers the saved prompts, pinned first", async ({ page }) => {
  const options = await page.locator("#prompt-select option").allTextContents();

  expect(options[0]).toBe("Select a saved prompt");
  expect(options[1]).toBe(PROMPTS.pinned.name);
  expect(options).toContain(PROMPTS.plain.name);
  expect(options).toContain(PROMPTS.variables.name);
  expect(options).toContain(PROMPTS.noted.name);
});

test("choosing a saved prompt fills in its text, size and model", async ({ page }) => {
  await page.locator("#prompt-select").selectOption({ label: PROMPTS.plain.name });

  await expect(page.locator("#prompt")).toHaveValue(PROMPTS.plain.prompt);
  await expect(page.locator("#size")).toHaveValue(PROMPTS.plain.size);
  await expect(modelRadio(page, PROMPTS.plain.model)).toBeChecked();
});

test("a prompt with variables offers a box for each, in both syntaxes", async ({ page }) => {
  await page.locator("#prompt-select").selectOption({ label: PROMPTS.variables.name });

  const variables = page.locator("#variables label");
  await expect(variables).toHaveCount(2);
  await expect(variables.nth(0)).toContainText("city");
  await expect(variables.nth(1)).toContainText("mood");

  await variables.nth(0).getByRole("textbox").fill("Lisbon");
  await expect(page.locator("#prompt")).toHaveValue(
    CITY_PROMPT.replace("{city}", "Lisbon")
  );

  await expect(page.locator("#prompt")).toHaveValue(/\[mood\]/);

  await variables.nth(1).getByRole("textbox").fill("calm");
  await expect(page.locator("#prompt")).toHaveValue(
    "A street in Lisbon at dusk, feeling calm"
  );
});

test("the character count follows the filled prompt, not only what was typed", async ({ page }) => {
  await page.locator("#prompt-select").selectOption({ label: PROMPTS.variables.name });
  await page.locator("#variables label").nth(0).getByRole("textbox").fill("Lisbon");

  const filled = CITY_PROMPT.replace("{city}", "Lisbon");
  await expect(page.locator("[data-char-count='prompt']")).toHaveText(
    `${filled.length} characters`
  );
});

test("generating shows a spinner, then the image, and asks the upstream once", async ({
  page,
  request,
}) => {
  await page.locator("#prompt").fill("a plain grey square");
  await page.locator("#size").selectOption("1536x1024");
  await pickModel(page, "2");
  await page.locator("#generate-btn").click();

  await expect(page.locator("#image")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#spinner")).toBeHidden();

  const log = await stubRequests(request);
  expect(log).toHaveLength(1);
  expect(log[0]).toMatchObject({
    path: "/v1/images/generations",
    model: "gpt-image-2",
    n: 1,
    size: "1536x1024",
    prompt: "a plain grey square",
  });
});

test("saving the preview puts it at the top of the library", async ({ page }) => {
  const prompt = "a plain grey square, saved from the generate page";

  await page.locator("#prompt").fill(prompt);
  await page.locator("#generate-btn").click();
  await expect(page.locator("#image")).toBeVisible({ timeout: 30_000 });

  await page.locator("#save-btn").click();
  await expect(page.locator("#view-link")).toBeVisible();

  await page.goto("/generations");
  await expect(
    page.locator("[data-generation-card]").first().locator("[data-prompt-show]")
  ).toHaveAttribute("data-prompt", prompt);
});

test("generate again sends a second request for the same prompt", async ({ page, request }) => {
  await page.locator("#prompt").fill("a plain grey square");
  await page.locator("#generate-btn").click();
  await expect(page.locator("#image")).toBeVisible({ timeout: 30_000 });

  await page.locator("#again-btn").click();
  await expect(page.locator("#image")).toBeVisible({ timeout: 30_000 });

  const log = await stubRequests(request);
  expect(log).toHaveLength(2);
  expect(log[1].prompt).toBe("a plain grey square");
});

test("regenerating from a saved image arrives with its settings filled in", async ({ page }) => {
  await page.goto("/generations");
  await cardFor(page, IMAGES.collected.prompt)
    .getByRole("link", { name: "Regenerate" })
    .click();

  await expect(page).toHaveURL(/\/generate\?from=\d+/);
  await expect(page.locator("#prompt")).toHaveValue(IMAGES.collected.prompt);
  await expect(page.locator("#size")).toHaveValue(IMAGES.collected.size);
  await expect(modelRadio(page, "2")).toBeChecked();
});
