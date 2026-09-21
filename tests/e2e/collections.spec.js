/**
 * Collections
 */

"use strict";

const fs = require("fs");
const { expect, test } = require("@playwright/test");
const { signIn, uniqueName, downloadTo, cardFor } = require("./support/app");
const { COLLECTION, IMAGES } = require("./support/seed");

function rowFor(page, name) {
  return page
    .locator("tr")
    .filter({ has: page.locator(`input[name="name"][value="${name}"]`) })
    .first();
}

async function createCollection(page) {
  const name = uniqueName("Collection");
  await page.goto("/collections");
  await page.getByRole("textbox", { name: "New collection" }).fill(name);
  await page.getByRole("button", { name: /add|create|save/i }).first().click();
  await expect(rowFor(page, name)).toBeVisible();
  return name;
}

async function deleteCollection(page, name) {
  await page.goto("/collections");
  const row = rowFor(page, name);
  await row.getByRole("button", { name: /delete/i }).click();
  await row.getByRole("button", { name: /^(Delete|Yes)/ }).click();
  await expect(rowFor(page, name)).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("the seeded collection holds one image, reachable from its count", async ({ page }) => {
  await page.goto("/collections");
  const row = rowFor(page, COLLECTION.name);
  await expect(row).toBeVisible();

  await row.getByRole("link", { name: /^\d+$/ }).click();
  await expect(page).toHaveURL(/collection=\d+/);
  await expect(page.locator("[data-generation-card]")).toHaveCount(1);
  await expect(cardFor(page, IMAGES.collected.prompt)).toBeVisible();
});

test("an image is added to a collection from its card, and taken out again", async ({ page }) => {
  const name = await createCollection(page);

  await page.goto("/generations");
  const card = cardFor(page, IMAGES.favourite.prompt);
  await card.locator("[data-collection-add]").selectOption({ label: name });

  await expect(card.locator("[data-collection-chip]", { hasText: name })).toBeVisible();

  await page.goto(`/generations`);
  await expect(
    cardFor(page, IMAGES.favourite.prompt).locator("[data-collection-chip]", { hasText: name })
  ).toBeVisible();

  await cardFor(page, IMAGES.favourite.prompt)
    .locator("[data-collection-chip]", { hasText: name })
    .locator("[data-collection-remove]")
    .click();
  await expect(
    cardFor(page, IMAGES.favourite.prompt).locator("[data-collection-chip]", { hasText: name })
  ).toHaveCount(0);

  await deleteCollection(page, name);
});

test("several images are added at once, and the filter finds them", async ({ page }) => {
  const name = await createCollection(page);

  await page.goto("/generations");
  await page.locator("[data-bulk-start]").click();
  await cardFor(page, IMAGES.favourite.prompt).getByRole("checkbox").check();
  await cardFor(page, IMAGES.shared.prompt).getByRole("checkbox").check();

  await page.locator('[name="collectionId"]').selectOption({ label: name });
  await page.locator('[formaction$="/bulk-collect"]').click();

  await page.goto("/collections");
  await rowFor(page, name).getByRole("link", { name: /^\d+$/ }).click();
  await expect(page.locator("[data-generation-card]")).toHaveCount(2);

  await page.goto("/generations?collection=none");
  await expect(cardFor(page, IMAGES.favourite.prompt)).toHaveCount(0);
  await expect(cardFor(page, IMAGES.shared.prompt)).toHaveCount(0);

  await deleteCollection(page, name);
});

test("a shared collection is public under its public title, never its own name", async ({
  page,
  browser,
  baseURL,
}) => {
  const name = await createCollection(page);
  const publicTitle = uniqueName("Selected");

  await page.goto("/generations");
  await cardFor(page, IMAGES.collected.prompt)
    .locator("[data-collection-add]")
    .selectOption({ label: name });

  await page.goto("/collections");
  const row = rowFor(page, name);
  await row.locator('input[name="title"]').fill(publicTitle);
  await row.getByRole("button", { name: "Share" }).click();

  const link = await rowFor(page, name).locator('a[href^="/c/"]').first().getAttribute("href");

  const stranger = await browser.newContext();
  const theirPage = await stranger.newPage();
  await theirPage.goto(`${baseURL}${link}`);

  await expect(theirPage.getByText(publicTitle)).toBeVisible();
  await expect(theirPage.getByText(name)).toHaveCount(0);
  await expect(theirPage.locator(".pub-tile")).toHaveCount(1);

  await theirPage.locator(".pub-tile").first().click();
  await expect(theirPage.getByText(IMAGES.collected.prompt)).toBeVisible();

  await theirPage.goto(`${baseURL}${link}`);
  const zip = await downloadTo(theirPage, () =>
    theirPage.getByRole("link", { name: /download/i }).first().click()
  );
  expect(fs.readFileSync(zip.path).subarray(0, 2).toString("latin1")).toBe("PK");

  await page.goto("/collections");
  await rowFor(page, name).getByRole("button", { name: "Un-share" }).click();

  const after = await theirPage.goto(`${baseURL}${link}`);
  expect(after.status()).toBeGreaterThanOrEqual(400);

  await stranger.close();
  await deleteCollection(page, name);
});

test("a collection that was never shared is named nowhere public", async ({
  page,
  browser,
  baseURL,
}) => {
  const stranger = await browser.newContext();
  const theirPage = await stranger.newPage();

  await theirPage.goto(`${baseURL}/gallery`);
  await expect(theirPage.getByText(COLLECTION.name)).toHaveCount(0);

  await stranger.close();
  await page.goto("/collections");
  await expect(rowFor(page, COLLECTION.name).getByRole("button", { name: "Share" })).toBeVisible();
});
