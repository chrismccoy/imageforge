/**
 * Favourites, and the link that shows them.
 */

"use strict";

const fs = require("fs");
const { expect, test } = require("@playwright/test");
const { signIn, downloadTo, cardFor } = require("./support/app");
const { IMAGES } = require("./support/seed");

function star(page, prompt) {
  return cardFor(page, prompt).getByRole("button", { name: "Favorite" });
}

async function shareFavourites(page) {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Create the link" }).click();
  const link = page.locator('a[href^="/f/"]').first();
  await expect(link).toBeVisible();
  return link.getAttribute("href");
}

async function unshareFavourites(page) {
  await page.goto("/settings");
  const off = page.getByRole("button", { name: "Un-share" });
  if (await off.isVisible().catch(() => false)) await off.click();
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("the favourites view holds exactly what is starred", async ({ page }) => {
  await page.goto("/generations?fav=1");

  await expect(cardFor(page, IMAGES.favourite.prompt)).toBeVisible();
  await expect(page.locator("[data-generation-card]")).toHaveCount(1);
});

test("a star saves at once, without a reload, and survives a search", async ({ page }) => {
  await page.goto("/generations?q=orchard");

  await page.evaluate(() => {
    window.__stillHere = true;
  });
  await star(page, IMAGES.shared.prompt).click();
  await expect(star(page, IMAGES.shared.prompt)).toHaveAttribute("aria-pressed", "true");

  expect(await page.evaluate(() => window.__stillHere === true)).toBe(true);
  await expect(page).toHaveURL(/q=orchard/);

  await page.goto("/generations?fav=1");
  await expect(page.locator("[data-generation-card]")).toHaveCount(2);

  await star(page, IMAGES.shared.prompt).click();
  await expect(page.locator("[data-generation-card]")).toHaveCount(1);

  await page.reload();
  await expect(page.locator("[data-generation-card]")).toHaveCount(1);
});

test("the favourites link shows the starred images to someone with no account", async ({
  page,
  browser,
  baseURL,
}) => {
  const link = await shareFavourites(page);

  const stranger = await browser.newContext();
  const theirPage = await stranger.newPage();
  await theirPage.goto(`${baseURL}${link}`);

  await expect(theirPage.locator(".pub-tile")).toHaveCount(1);
  await expect(
    theirPage.locator(`.pub-tile img[src*="${IMAGES.favourite.filename.replace(".png", "")}"]`)
  ).toHaveCount(0);

  const zip = await downloadTo(theirPage, () =>
    theirPage.getByRole("link", { name: /download/i }).first().click()
  );
  expect(zip.suggestedFilename).toMatch(/^favourites-\d{4}-\d{2}-\d{2}\.zip$/);
  expect(fs.readFileSync(zip.path).subarray(0, 2).toString("latin1")).toBe("PK");

  await stranger.close();
  await unshareFavourites(page);
});

test("turning the link off kills it at once", async ({ page, browser, baseURL }) => {
  const link = await shareFavourites(page);

  const stranger = await browser.newContext();
  const theirPage = await stranger.newPage();
  await theirPage.goto(`${baseURL}${link}`);
  await expect(theirPage.locator(".pub-tile")).toHaveCount(1);

  await unshareFavourites(page);

  const after = await theirPage.goto(`${baseURL}${link}`);
  expect(after.status()).toBeGreaterThanOrEqual(400);

  await stranger.close();
});

test("the favourites link is shown on the gallery only to the person signed in", async ({
  page,
  browser,
  baseURL,
}) => {
  const link = await shareFavourites(page);

  await page.goto("/gallery");
  await expect(page.locator(`a[href="${link}"]`).first()).toBeVisible();

  const stranger = await browser.newContext();
  const theirPage = await stranger.newPage();
  await theirPage.goto(`${baseURL}/gallery`);
  await expect(theirPage.locator(`a[href="${link}"]`)).toHaveCount(0);

  await stranger.close();
  await unshareFavourites(page);
});
