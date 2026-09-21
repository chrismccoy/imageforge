/**
 * Share links and the lists
 */

"use strict";

const { expect, test } = require("@playwright/test");
const { signIn, cardFor } = require("./support/app");
const { IMAGES, SHARED_TOKEN } = require("./support/seed");

async function setToggle(page, name, on) {
  await page.goto("/settings");
  const box = page.locator(`input[name="${name}"]`);
  await box.setChecked(on, { force: true });
  await page.getByRole("button", { name: /save/i }).last().click();
  await expect(page.locator(`input[name="${name}"]`)).toBeChecked({ checked: on });
}

async function asStranger(browser, baseURL, url) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const response = await page.goto(`${baseURL}${url}`);
  return { context, page, response };
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("a shared image opens for a stranger, with everything about it", async ({
  browser,
  baseURL,
}) => {
  const { context, page } = await asStranger(browser, baseURL, `/s/${SHARED_TOKEN}`);

  await expect(page.getByText(IMAGES.shared.prompt)).toBeVisible();
  await expect(page.getByText(IMAGES.shared.model)).toBeVisible();
  await expect(page.getByText(IMAGES.shared.size)).toBeVisible();
  await expect(page.getByRole("link", { name: /download/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /copy prompt/i })).toBeVisible();

  await expect(
    page.getByText(`${IMAGES.shared.usage.total.toLocaleString("en-US")} tokens`)
  ).toBeVisible();

  await expect(page.getByRole("link", { name: /dashboard/i })).toHaveCount(0);

  await context.close();
});

test("the image link serves the picture, with or without its extension", async ({ request }) => {
  const withExtension = await request.get(`/i/${SHARED_TOKEN}.png`);
  expect(withExtension.status()).toBe(200);
  expect(withExtension.headers()["content-type"]).toContain("image/png");
  expect((await withExtension.body()).subarray(0, 8).toString("hex")).toBe(
    "89504e470d0a1a0a"
  );

  const without = await request.get(`/i/${SHARED_TOKEN}`);
  expect(without.status()).toBe(200);
  expect(without.headers()["content-type"]).toContain("image/png");
});

test("a shared page is not for crawlers, and carries a preview card", async ({ request }) => {
  const html = await (await request.get(`/s/${SHARED_TOKEN}`)).text();

  expect(html).toContain("noindex");
  expect(html).toMatch(/property="og:image"/);
  expect(html).toMatch(/property="og:title"|property="og:description"/);
});

test("the same page shows a way back to the dashboard when signed in", async ({ page }) => {
  await page.goto(`/s/${SHARED_TOKEN}`);
  await expect(page.getByRole("link", { name: /dashboard/i }).first()).toBeVisible();
});

test("sharing and unsharing an image turns its link on and off", async ({
  page,
  browser,
  baseURL,
}) => {
  await page.goto("/generations");
  const card = cardFor(page, IMAGES.favourite.prompt);
  await expect(card.locator("[data-share-none]")).toBeVisible();

  await card.locator('[data-share="link"]').click();
  await expect(card.locator("[data-share-badge]")).toBeVisible();

  const link = await card.locator('[data-share="link"]').getAttribute("data-share-url");
  expect(link).toBeTruthy();

  const opened = await asStranger(browser, baseURL, new URL(link, baseURL).pathname);
  await expect(opened.page.getByText(IMAGES.favourite.prompt)).toBeVisible();

  await page.goto("/generations");
  const again = cardFor(page, IMAGES.favourite.prompt);
  await again.locator("[data-share-unshare] [data-confirm-open]").click();
  await again.getByRole("button", { name: /^(Unshare|Yes)/ }).click();
  await expect(again.locator("[data-share-none]")).toBeVisible();

  const after = await opened.page.goto(`${baseURL}${new URL(link, baseURL).pathname}`);
  expect(after.status()).toBeGreaterThanOrEqual(400);

  await opened.context.close();
});

test("descriptive links carry the start of the prompt, and old links keep working", async ({
  page,
  browser,
  baseURL,
}) => {
  await setToggle(page, "public_share_slug", true);

  await page.goto("/generations");
  const card = cardFor(page, IMAGES.collected.prompt);
  await card.locator('[data-share="link"]').click();
  await expect(card.locator("[data-share-badge]")).toBeVisible();

  const link = await card.locator('[data-share="link"]').getAttribute("data-share-url");
  expect(link).toMatch(/\/s\/[a-z0-9-]+-[A-Za-z0-9]+$/);

  const old = await asStranger(browser, baseURL, `/s/${SHARED_TOKEN}`);
  expect(old.response.status()).toBe(200);
  await old.context.close();

  await setToggle(page, "public_share_slug", false);
  await page.goto("/generations");
  const back = cardFor(page, IMAGES.collected.prompt);
  await back.locator("[data-share-unshare] [data-confirm-open]").click();
  await back.getByRole("button", { name: /^(Unshare|Yes)/ }).click();
});

test("the gallery lists what is shared and nothing private", async ({ browser, baseURL }) => {
  const { context, page } = await asStranger(browser, baseURL, "/gallery");

  await expect(page.locator(".pub-tile")).toHaveCount(1);
  const html = await page.content();
  expect(html).toContain("noindex");
  expect(html).not.toContain(IMAGES.collected.prompt);

  await context.close();
});

test("the gallery can be closed to strangers while staying open to the admin", async ({
  page,
  browser,
  baseURL,
}) => {
  await setToggle(page, "public_gallery", false);

  const { context, page: theirPage } = await asStranger(browser, baseURL, "/gallery");
  await expect(theirPage).toHaveURL(/\/login/);
  await expect(theirPage.locator(".pub-tile")).toHaveCount(0);
  await context.close();

  await page.goto("/gallery");
  await expect(page).toHaveURL(/\/gallery/);
  await expect(page.locator(".pub-tile")).toHaveCount(1);

  await setToggle(page, "public_gallery", true);
});

test("Settings refuses to leave the gallery published with sharing off", async ({ page }) => {
  await page.goto("/settings");
  await page.locator('input[name="public_share"]').setChecked(false, { force: true });
  await page.getByRole("button", { name: /save/i }).last().click();

  await expect(page.getByText(/public sharing/i).first()).toBeVisible();
  await expect(page.locator('input[name="public_share"]')).toBeChecked();
  await expect(page.locator('input[name="public_gallery"]')).toBeChecked();
});
