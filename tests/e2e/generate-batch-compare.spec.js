/**
 * Batches, and the same prompt for mulitple models
 */

"use strict";

const { expect, test } = require("@playwright/test");
const { signIn, resetStub, armStubFailure, stubRequests } = require("./support/app");
const { MODEL_TOKENS, MODELS } = require("../../config/images");

const ALL_MODEL_IDS = MODEL_TOKENS.map((token) => MODELS[token]).sort();

const PROMPT = "a plain grey square for a batch";

test.beforeEach(async ({ page, request }) => {
  await resetStub(request);
  await signIn(page);
  await page.goto("/generate");
  await page.locator("#prompt").fill(PROMPT);
});

test("asking for two images returns two, in one request", async ({ page, request }) => {
  await page.locator("#count").selectOption("2");
  await page.locator("#generate-btn").click();

  await expect(page.locator("#tiles > *")).toHaveCount(2, { timeout: 30_000 });

  const log = await stubRequests(request);
  expect(log).toHaveLength(1);
  expect(log[0].n).toBe(2);
});

test("asking for four returns four, and one of them can be kept", async ({ page }) => {
  await page.locator("#count").selectOption("4");
  await page.locator("#generate-btn").click();

  const tiles = page.locator("#tiles > *");
  await expect(tiles).toHaveCount(4, { timeout: 30_000 });

  await expect(page.locator("#save-btn")).toBeDisabled();

  await tiles.nth(1).click();
  await expect(page.locator("#save-btn")).toBeEnabled();
  await page.locator("#save-btn").click();
  await expect(page.locator("#view-link")).toBeVisible();

  await page.goto("/generations");
  await expect(
    page.locator(`[data-prompt-show][data-prompt="${PROMPT}"]`)
  ).toHaveCount(1);
});

test("a batch can be thrown away without saving any of it", async ({ page }) => {
  const prompt = "a plain grey square nobody keeps";
  await page.locator("#prompt").fill(prompt);
  await page.locator("#count").selectOption("4");
  await page.locator("#generate-btn").click();

  await expect(page.locator("#tiles > *")).toHaveCount(4, { timeout: 30_000 });

  await expect(page.locator("#save-btn")).toBeDisabled();

  await page.goto("/generations");
  await expect(
    page.locator(`[data-prompt-show][data-prompt="${prompt}"]`)
  ).toHaveCount(0);
});

test("comparing asks every model once each and labels what came back", async ({
  page,
  request,
}) => {
  await page.locator("#compare").check();
  await page.locator("#generate-btn").click();

  const tiles = page.locator("#tiles > *");
  await expect(tiles).toHaveCount(ALL_MODEL_IDS.length, { timeout: 30_000 });

  const labels = await page.locator("#tiles [data-model]").allTextContents();
  expect(labels.sort()).toEqual(ALL_MODEL_IDS);

  const log = await stubRequests(request);
  expect(log).toHaveLength(ALL_MODEL_IDS.length);
  expect(log.map((call) => call.model).sort()).toEqual(ALL_MODEL_IDS);
  expect(log.every((call) => call.n === 1)).toBe(true);
});

test("while comparing, the page says how many images it is waiting for", async ({ page }) => {
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/api/generate", async (route) => {
    await held;
    await route.continue();
  });

  await page.locator("#compare").check();
  await page.locator("#generate-btn").click();

  await expect(page.locator("#spinner-text")).toHaveText(
    `Generating your ${MODEL_TOKENS.length} images`
  );

  release();
  await expect(page.locator("#tiles > *")).toHaveCount(MODEL_TOKENS.length, {
    timeout: 30_000,
  });
});

test("the compare toggle says what it will cost before it is used", async ({ page }) => {
  await expect(page.getByText(`always costs ${MODEL_TOKENS.length}`)).toBeVisible();
});

test("when one model fails the other still arrives, and the page says which", async ({
  page,
  request,
}) => {
  await armStubFailure(request, { model: "gpt-image-2", status: 400 });

  await page.locator("#compare").check();
  await page.locator("#generate-btn").click();

  await expect(page.locator("#tiles > *")).toHaveCount(ALL_MODEL_IDS.length - 1, {
    timeout: 30_000,
  });
  const labels = await page.locator("#tiles [data-model]").allTextContents();
  expect(labels).not.toContain("gpt-image-2");
  await expect(page.locator("#status")).toContainText("gpt-image-2 did not answer.");
});

test("a failed generation says so rather than showing an empty frame", async ({
  page,
  request,
}) => {
  await armStubFailure(request, { status: 400 });

  await page.locator("#generate-btn").click();

  await expect(page.locator("#status")).not.toBeEmpty({ timeout: 30_000 });
  await expect(page.locator("#image")).toBeHidden();
});
