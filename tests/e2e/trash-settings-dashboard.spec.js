/**
 * The trash, the settings and the dashboard.
 */

"use strict";

const { expect, test } = require("@playwright/test");
const { signIn, cardFor, uniqueSlug, modelRadio, pickModel } = require("./support/app");
const { IMAGES, TRASHED, PAGE_SIZE, PRICES, COLLECTION } = require("./support/seed");

async function saveOneImage(page) {
  const prompt = `a picture for the trash ${uniqueSlug()}`;
  await page.goto("/generate");
  await page.locator("#prompt").fill(prompt);
  await page.locator("#generate-btn").click();
  await expect(page.locator("#image")).toBeVisible({ timeout: 30_000 });
  await page.locator("#save-btn").click();
  await expect(page.locator("#view-link")).toBeVisible();
  return prompt;
}

async function deleteImage(page, prompt) {
  await page.goto("/generations");
  const card = cardFor(page, prompt);
  await card.getByRole("button", { name: "Delete" }).click();
  await card.getByRole("button", { name: /^(Delete|Yes)/ }).click();
  await expect(page.locator(`[data-prompt-show][data-prompt="${prompt}"]`)).toHaveCount(0);
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("the trash holds what was thrown away, with what it is costing", async ({ page }) => {
  await page.goto("/trash");

  await expect(page.getByText(TRASHED.prompt)).toBeVisible();
  await expect(page.getByText(/image(s)? waiting/)).toBeVisible();
});

test("deleting moves an image to the trash, and restoring brings it back", async ({ page }) => {
  const prompt = await saveOneImage(page);

  await page.goto("/generations");
  await cardFor(page, prompt).locator('[data-share="link"]').click();
  await expect(cardFor(page, prompt).locator("[data-share-badge]")).toBeVisible();
  const link = await cardFor(page, prompt)
    .locator('[data-share="link"]')
    .getAttribute("data-share-url");

  await deleteImage(page, prompt);

  await page.goto("/trash");
  await expect(page.getByText(prompt)).toBeVisible();

  const gone = await page.request.get(new URL(link, "http://127.0.0.1:3200").pathname);
  expect(gone.status()).toBeGreaterThanOrEqual(400);

  const row = page.locator("tr").filter({ hasText: prompt }).first();
  await row.getByRole("button", { name: /restore/i }).click();

  await page.goto("/generations");
  await expect(cardFor(page, prompt)).toBeVisible();
  await expect(cardFor(page, prompt).locator("[data-share-badge]")).toBeVisible();
  const back = await page.request.get(new URL(link, "http://127.0.0.1:3200").pathname);
  expect(back.status()).toBe(200);
});

test("the API key is saved and shown only by its last few characters", async ({ page }) => {
  await page.goto("/settings");
  await page.locator("#api_key").fill("sk-test-abcdefghijklmnop");
  await page.getByRole("button", { name: /save/i }).first().click();

  await page.goto("/settings");
  const placeholder = await page.locator("#api_key").getAttribute("placeholder");
  expect(placeholder).toContain("Current:");
  expect(placeholder).not.toContain("abcdefghij");
  expect(placeholder).toContain("mnop");
});

test("the model and size saved in Settings are what the Generate page starts with", async ({
  page,
}) => {
  await page.goto("/settings");
  await pickModel(page, "2.5-sunburst");
  await page.locator("#default_size").selectOption("1024x1536");
  await page.getByRole("button", { name: /save/i }).first().click();

  await page.goto("/generate");
  await expect(modelRadio(page, "2.5-sunburst")).toBeChecked();
  await expect(page.locator("#size")).toHaveValue("1024x1536");

  await page.goto("/settings");
  await pickModel(page, "1.5");
  await page.locator("#default_size").selectOption("1024x1024");
  await page.getByRole("button", { name: /save/i }).first().click();
});

test("the per-page setting decides how many images a page shows", async ({ page }) => {
  await page.goto("/settings");
  await page.locator("#page_size").fill("2");
  await page.getByRole("button", { name: /save/i }).first().click();

  await page.goto("/generations");
  await expect(page.locator("[data-generation-card]")).toHaveCount(2);

  await page.goto("/settings");
  await page.locator("#page_size").fill(String(PAGE_SIZE));
  await page.getByRole("button", { name: /save/i }).first().click();
});

test("Settings says who is signed in, how the address list stands, and how full it is", async ({
  page,
}) => {
  await page.goto("/settings");

  await expect(page.getByText("admin").first()).toBeVisible();
  await expect(page.getByText("any address", { exact: true })).toBeVisible();
  await expect(page.getByText("Behind a proxy")).toBeVisible();
  await expect(page.getByText(/% of quota used|of 500/).first()).toBeVisible();
});

test("a priced model puts a cost on a card and on the page a stranger sees", async ({
  page,
  browser,
  baseURL,
}) => {
  await page.goto("/generations");
  const card = cardFor(page, IMAGES.favourite.prompt);
  await expect(card).toContainText("tokens");
  await expect(card).toContainText("$");

  const shared = await browser.newContext();
  const theirPage = await shared.newPage();
  await theirPage.goto(`${baseURL}/s/${require("./support/seed").SHARED_TOKEN}`);
  await expect(theirPage.getByText("$")).toBeVisible();
  await shared.close();

  expect(Object.keys(PRICES)).toContain(IMAGES.favourite.model);
});

test("the dashboard shows the library, the spend, the collections and the chart", async ({
  page,
}) => {
  await page.goto("/");

  for (const widget of ["recent", "library", "images", "spend", "storage", "favourites"]) {
    await expect(page.locator(`[data-widget="${widget}"]`)).toBeVisible();
  }

  await expect(page.locator('[data-widget="collections-widget"]')).toContainText(
    COLLECTION.name
  );

  const bars = page.locator('[data-widget="output"] rect');
  await expect(bars).toHaveCount(30);
  const first = await bars.first().locator("title").textContent();
  expect(first).toMatch(/^\d{4}-\d{2}-\d{2}: \d+$/);
});

test("the old stats address still leads to the dashboard", async ({ page }) => {
  await page.goto("/stats");
  await expect(page.locator('[data-widget="library"]')).toBeVisible();
});

test("emptying the trash clears it for good", async ({ page }) => {
  await page.goto("/trash");
  await expect(page.locator("tbody tr").first()).toBeVisible();

  await page.getByRole("button", { name: /empty/i }).first().click();
  const confirm = page.getByRole("button", { name: /^(Empty|Delete|Yes)/ }).last();
  if (await confirm.isVisible().catch(() => false)) await confirm.click();

  await expect(page.getByText(TRASHED.prompt)).toHaveCount(0);
});
