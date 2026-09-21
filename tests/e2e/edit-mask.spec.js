/**
 * The mask editor.
 */

"use strict";

const { expect, test } = require("@playwright/test");
const { signIn, paint, dragBox } = require("./support/app");
const { IMAGES } = require("./support/seed");

async function holes(canvas) {
  return canvas.evaluate((el) => {
    const { width, height } = el;
    const data = el.getContext("2d").getImageData(0, 0, width, height).data;
    let clear = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 128) clear += 1;
    return clear;
  });
}

async function holeAt(canvas, [fx, fy]) {
  return canvas.evaluate(
    (el, at) => {
      const x = Math.round(el.width * at[0]);
      const y = Math.round(el.height * at[1]);
      const pixel = el.getContext("2d").getImageData(x, y, 1, 1).data;
      return pixel[3] < 128;
    },
    [fx, fy]
  );
}

async function openEditor(page) {
  await page.goto("/generations");
  await page
    .locator("[data-generation-card]")
    .filter({
      has: page.locator(`[data-prompt-show][data-prompt="${IMAGES.favourite.prompt}"]`),
    })
    .first()
    .getByRole("link", { name: "Edit" })
    .click();

  await expect(page).toHaveURL(/\/edit\/\d+/);
  const canvas = page.locator("#mask");
  await expect(canvas).toBeVisible();
  return canvas;
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("a brush stroke paints, and undo takes back only the last one", async ({ page }) => {
  const canvas = await openEditor(page);
  expect(await holes(canvas)).toBe(0);

  await paint(page, canvas, [
    [0.2, 0.2],
    [0.4, 0.2],
  ]);
  const afterFirst = await holes(canvas);
  expect(afterFirst).toBeGreaterThan(0);

  await paint(page, canvas, [
    [0.2, 0.7],
    [0.5, 0.7],
  ]);
  expect(await holes(canvas)).toBeGreaterThan(afterFirst);

  await page.locator("#undo-btn").click();
  expect(await holes(canvas)).toBe(afterFirst);
});

test("wipe clears the whole painted area", async ({ page }) => {
  const canvas = await openEditor(page);

  await paint(page, canvas, [
    [0.2, 0.2],
    [0.8, 0.8],
  ]);
  expect(await holes(canvas)).toBeGreaterThan(0);

  await page.locator("#clear-btn").click();
  expect(await holes(canvas)).toBe(0);
});

test("the eraser takes back part of a stroke without undoing it", async ({ page }) => {
  const canvas = await openEditor(page);

  await paint(page, canvas, [
    [0.2, 0.5],
    [0.8, 0.5],
  ]);
  const painted = await holes(canvas);

  await page.locator("[data-tool='eraser']").click();
  await paint(page, canvas, [
    [0.7, 0.5],
    [0.8, 0.5],
  ]);

  const left = await holes(canvas);
  expect(left).toBeLessThan(painted);
  expect(left).toBeGreaterThan(0);
});

test("a wider brush paints more than a narrow one", async ({ page }) => {
  const canvas = await openEditor(page);

  await page.locator("#brush").fill("8");
  await paint(page, canvas, [
    [0.2, 0.3],
    [0.8, 0.3],
  ]);
  const narrow = await holes(canvas);

  await page.locator("#clear-btn").click();
  await page.locator("#brush").fill("160");
  await paint(page, canvas, [
    [0.2, 0.3],
    [0.8, 0.3],
  ]);

  expect(await holes(canvas)).toBeGreaterThan(narrow);
});

test("the box tool paints a rectangle, and the oval an ellipse", async ({ page }) => {
  const canvas = await openEditor(page);

  await page.locator("[data-tool='rect']").click();
  await dragBox(page, canvas, { from: [0.3, 0.3], to: [0.7, 0.7] });

  expect(await holeAt(canvas, [0.5, 0.5])).toBe(true);
  expect(await holeAt(canvas, [0.1, 0.1])).toBe(false);

  await page.locator("#clear-btn").click();

  await page.locator("[data-tool='ellipse']").click();
  await dragBox(page, canvas, { from: [0.3, 0.3], to: [0.7, 0.7] });

  expect(await holeAt(canvas, [0.5, 0.5])).toBe(true);
  expect(await holeAt(canvas, [0.32, 0.32])).toBe(false);
});

test("each tool says what it does", async ({ page }) => {
  await openEditor(page);
  const hint = page.locator("#tool-hint");

  await expect(hint).toContainText("Paint over what should change");

  await page.locator("[data-tool='rect']").click();
  await expect(hint).toContainText("Drag a box");

  await page.locator("[data-tool='ellipse']").click();
  await expect(hint).toContainText("Drag an oval");

  await page.locator("[data-tool='eraser']").click();
  await expect(hint).toContainText("takes back part of what you painted");
});

test("invert is a way of reading the painting, not a change to it", async ({ page }) => {
  const canvas = await openEditor(page);

  await paint(page, canvas, [
    [0.3, 0.4],
    [0.6, 0.4],
  ]);
  const painted = await holes(canvas);

  await page.locator("#invert-btn").click();
  await expect(page.locator("#invert-btn")).toHaveAttribute("aria-pressed", "true");
  expect(await holes(canvas)).toBeGreaterThan(painted);

  await page.locator("#invert-btn").click();
  await expect(page.locator("#invert-btn")).toHaveAttribute("aria-pressed", "false");
  expect(await holes(canvas)).toBe(painted);
});

test("zooming in makes the same stroke finer on the picture itself", async ({ page }) => {
  const canvas = await openEditor(page);

  await paint(page, canvas, [
    [0.4, 0.4],
    [0.6, 0.4],
  ]);
  const atFit = await holes(canvas);

  await page.locator("#clear-btn").click();

  await page.locator("#zoom-in").click();
  await page.locator("#zoom-in").click();
  await page.locator("#zoom-in").click();
  await expect(page.locator("#zoom-level")).toHaveText("400%");

  await paint(page, canvas, [
    [0.4, 0.4],
    [0.6, 0.4],
  ]);

  expect(await holes(canvas)).toBeLessThan(atFit);
});
