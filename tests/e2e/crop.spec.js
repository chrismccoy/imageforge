/**
 * Cropping a saved image.
 */

"use strict";

const { expect, test } = require("@playwright/test");
const { signIn, resetStub, stubRequests, cardFor } = require("./support/app");
const { IMAGES } = require("./support/seed");

async function dragHandle(page, stage, handle, to) {
  const grip = stage.locator(`[data-handle="${handle}"]`);
  await grip.scrollIntoViewIfNeeded();

  const box = await stage.boundingBox();
  const from = await grip.boundingBox();

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], {
    steps: 20,
  });
  await page.mouse.up();
}

async function openCrop(page) {
  await page.goto("/generations");
  await page
    .locator("[data-generation-card]")
    .filter({
      has: page.locator(`[data-prompt-show][data-prompt="${IMAGES.shared.prompt}"]`),
    })
    .filter({ hasText: IMAGES.shared.size })
    .first()
    .getByRole("link", { name: "Crop" })
    .click();
  await expect(page).toHaveURL(/\/crop\/\d+/);

  const stage = page.locator("#stage");
  await expect(stage).toBeVisible();
  return stage;
}

async function readout(page) {
  const text = await page.locator("#crop-size").textContent();
  const [width, height] = text.split("×").map((part) => Number(part.trim()));
  return { width, height };
}

test.beforeEach(async ({ page, request }) => {
  await resetStub(request);
  await signIn(page);
});

test("dragging a box shows its size in the picture's own pixels", async ({ page }) => {
  const stage = await openCrop(page);

  await dragHandle(page, stage, "se", [0.5, 0.5]);

  const half = await readout(page);
  expect(Math.abs(half.width - 768)).toBeLessThanOrEqual(8);
  expect(Math.abs(half.height - 512)).toBeLessThanOrEqual(8);

  await dragHandle(page, stage, "se", [0.25, 0.25]);
  const smaller = await readout(page);
  expect(smaller.width).toBeLessThan(half.width);
});

test("locking the shape keeps the ratio while dragging", async ({ page }) => {
  const stage = await openCrop(page);

  const square = page.getByRole("button", { name: "1:1", exact: true });
  await square.click();
  await expect(square).toHaveAttribute("aria-pressed", "true");

  await dragHandle(page, stage, "se", [0.7, 0.4]);

  const size = await readout(page);
  expect(Math.abs(size.width - size.height)).toBeLessThanOrEqual(2);
});

test("a crop is saved as a new image, keeps the original, and costs nothing", async ({
  page,
  request,
}) => {
  const stage = await openCrop(page);
  await dragHandle(page, stage, "se", [0.6, 0.6]);

  const cropped = await readout(page);

  await page.locator("#crop-btn").click();
  await expect(page.locator("#saved")).toBeVisible({ timeout: 30_000 });

  expect(await stubRequests(request)).toEqual([]);

  await page.goto("/generations");
  await expect(cardFor(page, IMAGES.shared.prompt)).toBeVisible();

  const cards = page.locator("[data-generation-card]", {
    hasText: `${cropped.width}x${cropped.height}`,
  });
  await expect(cards.first()).toBeVisible();
});

test("whole image puts the box back to the full picture", async ({ page }) => {
  const stage = await openCrop(page);

  await dragHandle(page, stage, "se", [0.5, 0.5]);
  await page.locator("#reset-btn").click();

  await expect(page.locator("#crop-size")).toHaveText("1536 × 1024");
});
