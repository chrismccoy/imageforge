/**
 * Batches, and the same prompt for mulitple models
 */

"use strict";

const { expect, test } = require("@playwright/test");
const {
  signIn,
  resetStub,
  armStubFailure,
  stubRequests,
  pickModel,
  modelRadio,
} = require("./support/app");

const PROMPT = "a plain grey square for a batch";

test.beforeEach(async ({ page, request }) => {
  await resetStub(request);
  await signIn(page);
  await page.goto("/generate");
  await page.locator("#prompt").fill(PROMPT);
});

test("asking for two images returns two, in one request", async ({
  page,
  request,
}) => {
  await page.locator("#count").selectOption("2");
  await page.locator("#generate-btn").click();

  await expect(page.locator("#tiles > *")).toHaveCount(2, { timeout: 30_000 });

  const log = await stubRequests(request);
  expect(log).toHaveLength(1);
  expect(log[0].n).toBe(2);
});

test("asking for four returns four, and one of them can be kept", async ({
  page,
}) => {
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

test("comparing asks every model, the selected one twice, and labels what came back", async ({
  page,
  request,
}) => {
  await page.locator("#compare").check();
  await page.locator("#generate-btn").click();

  const tiles = page.locator("#tiles > *");
  await expect(tiles).toHaveCount(4, { timeout: 30_000 });

  const labels = await page.locator("#tiles [data-model]").allTextContents();
  expect(labels).toEqual([
    "gpt-image-2",
    "gpt-image-2.6-sunburst #1",
    "gpt-image-2.6-sunburst #2",
    "gpt-image-2.6-flare",
  ]);

  const log = await stubRequests(request);
  expect(log.map((call) => call.model).sort()).toEqual([
    "gpt-image-2",
    "gpt-image-2.6-flare",
    "gpt-image-2.6-sunburst",
    "gpt-image-2.6-sunburst",
  ]);
  expect(log.every((call) => call.n === 1)).toBe(true);
});

test("the model can still be picked while comparing, and that is the one doubled", async ({
  page,
}) => {
  await page.locator("#compare").check();
  await expect(modelRadio(page, "2")).toBeEnabled();
  await pickModel(page, "2");
  await page.locator("#generate-btn").click();

  await expect(page.locator("#tiles > *")).toHaveCount(4, { timeout: 30_000 });
  const labels = await page.locator("#tiles [data-model]").allTextContents();
  expect(labels).toEqual([
    "gpt-image-2 #1",
    "gpt-image-2 #2",
    "gpt-image-2.6-sunburst",
    "gpt-image-2.6-flare",
  ]);
});

test("every model button is wide enough for its name", async ({ page }) => {
  const clipped = await page
    .locator("[data-model-strip] label")
    .evaluateAll((labels) =>
      labels
        .filter((label) => label.scrollWidth > label.clientWidth)
        .map((label) => label.textContent.trim())
    );
  expect(clipped).toEqual([]);
});

test("while comparing, the page says how many images it is waiting for", async ({
  page,
}) => {
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
    "Generating your 4 images"
  );

  release();
  await expect(page.locator("#tiles > *")).toHaveCount(4, { timeout: 30_000 });
});

test("the compare toggle says what it will cost before it is used", async ({
  page,
}) => {
  await expect(page.getByText("always costs 4")).toBeVisible();
});

test("when one model fails the other still arrives, and the page says which", async ({
  page,
  request,
}) => {
  await armStubFailure(request, { model: "gpt-image-2", status: 400 });

  await page.locator("#compare").check();
  await page.locator("#generate-btn").click();

  await expect(page.locator("#tiles > *")).toHaveCount(3, { timeout: 30_000 });
  const labels = await page.locator("#tiles [data-model]").allTextContents();
  expect(labels).not.toContain("gpt-image-2");
  await expect(page.locator("#status")).toContainText(
    "gpt-image-2 did not answer."
  );
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
