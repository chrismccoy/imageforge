/**
 * Making an edit and saving it.
 */

"use strict";

const { expect, test } = require("@playwright/test");
const {
  signIn,
  paint,
  resetStub,
  armStubFailure,
  stubRequests,
  cardFor,
} = require("./support/app");
const { IMAGES } = require("./support/seed");

async function openEditor(page) {
  await page.goto("/generations");
  await cardFor(page, IMAGES.favourite.prompt).getByRole("link", { name: "Edit" }).click();
  await expect(page).toHaveURL(/\/edit\/\d+/);

  const canvas = page.locator("#mask");
  await expect(canvas).toBeVisible();
  return canvas;
}

async function makeEdit(page, canvas, prompt) {
  await paint(page, canvas, [
    [0.35, 0.45],
    [0.65, 0.55],
  ]);
  await page.locator("#prompt").fill(prompt);
  await page.locator("#edit-btn").click();
  await expect(page.locator("#edited")).toBeVisible({ timeout: 30_000 });
}

test.beforeEach(async ({ page, request }) => {
  await resetStub(request);
  await signIn(page);
});

test("an edit sends the picture and the painted mask, once", async ({ page, request }) => {
  const canvas = await openEditor(page);
  await makeEdit(page, canvas, "a white circle in the middle");

  const log = await stubRequests(request);
  expect(log).toHaveLength(1);
  expect(log[0]).toMatchObject({
    path: "/v1/images/edits",
    hasMask: true,
    prompt: "a white circle in the middle",
  });
});

test("the result appears over the original, with a slider between them", async ({ page }) => {
  const canvas = await openEditor(page);
  await makeEdit(page, canvas, "a white circle in the middle");

  await expect(page.locator("#edited")).toBeVisible();
  await expect(page.locator("#wipe-row")).toBeVisible();

  const wipe = page.locator("#wipe");
  await expect(wipe).toHaveValue("0");
  await wipe.fill("100");
  await expect(wipe).toHaveValue("100");
  await expect(page.locator("#wipe-handle")).toBeVisible();
});

test("going back to the brush finds the painting still there", async ({ page }) => {
  const canvas = await openEditor(page);

  await paint(page, canvas, [
    [0.3, 0.4],
    [0.7, 0.4],
  ]);
  const painted = await canvas.evaluate((el) => {
    const data = el.getContext("2d").getImageData(0, 0, el.width, el.height).data;
    let clear = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 128) clear += 1;
    return clear;
  });

  await page.locator("#prompt").fill("a white circle in the middle");
  await page.locator("#edit-btn").click();
  await expect(page.locator("#edited")).toBeVisible({ timeout: 30_000 });

  await page.locator("#revert-btn").click();
  await expect(page.locator("#mask")).toBeVisible();

  const stillPainted = await canvas.evaluate((el) => {
    const data = el.getContext("2d").getImageData(0, 0, el.width, el.height).data;
    let clear = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 128) clear += 1;
    return clear;
  });
  expect(stillPainted).toBe(painted);
});

test("saving an edit keeps the original and records where the edit came from", async ({
  page,
}) => {
  const prompt = `an edit kept at ${Date.now()}`;
  const canvas = await openEditor(page);
  await makeEdit(page, canvas, prompt);

  await page.locator("#save-btn").click();
  await expect(page.locator("#view-link")).toBeVisible();

  await page.goto("/generations");
  await expect(page.locator(`[data-prompt-show][data-prompt="${prompt}"]`)).toHaveCount(1);
  await expect(cardFor(page, IMAGES.favourite.prompt)).toBeVisible();

  await cardFor(page, prompt)
    .getByRole("link", { name: /^From #\d+$/ })
    .click();
  await expect(page).toHaveURL(/\/generations\/\d+\/compare$/);
  await expect(page.locator("#original")).toBeVisible();
  await expect(page.locator("#edited")).toBeVisible();
  await expect(page.locator("#slider")).toBeVisible();
});

test("an edit the service refuses is reported, and saves nothing", async ({ page, request }) => {
  const canvas = await openEditor(page);
  await armStubFailure(request, { status: 400 });

  await paint(page, canvas, [
    [0.35, 0.45],
    [0.65, 0.55],
  ]);
  await page.locator("#prompt").fill("an edit that will be refused");
  await page.locator("#edit-btn").click();

  await expect(page.locator("#status")).not.toBeEmpty({ timeout: 30_000 });
  await expect(page.locator("#edited")).toBeHidden();

  await page.goto("/generations");
  await expect(
    page.locator('[data-prompt-show][data-prompt="an edit that will be refused"]')
  ).toHaveCount(0);
});
