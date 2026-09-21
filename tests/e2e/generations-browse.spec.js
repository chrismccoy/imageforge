/**
 * Browsing, searching and deleted images.
 */

"use strict";

const fs = require("fs");
const yauzl = require("yauzl");

const { expect, test } = require("@playwright/test");
const { signIn, downloadTo, cardFor } = require("./support/app");
const { IMAGES, PAGE_SIZE } = require("./support/seed");

function zipEntries(file) {
  return new Promise((resolve, reject) => {
    const names = [];
    yauzl.open(file, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      zip.on("entry", (entry) => {
        names.push(entry.fileName);
        zip.readEntry();
      });
      zip.on("end", () => resolve(names));
      zip.on("error", reject);
      zip.readEntry();
    });
  });
}

function looksLikeZip(file) {
  return fs.readFileSync(file).subarray(0, 2).toString("latin1") === "PK";
}

async function useGridView(page) {
  await page.goto("/generations");
  const toList = page.getByRole("button", { name: "Grid view" });
  if (await toList.isVisible().catch(() => false)) await toList.click();
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test.afterEach(async ({ page }) => {
  await useGridView(page);
});

test("the list view shows each prompt beside its image, and is remembered", async ({ page }) => {
  await page.goto("/generations");
  await expect(page.locator("[data-row-prompt]")).toHaveCount(0);

  await page.getByRole("button", { name: "List view" }).click();
  await expect(page.locator("[data-row-prompt]").first()).toBeVisible();

  await page.reload();
  await expect(page.locator("[data-row-prompt]").first()).toBeVisible();

  await page.goto("/generations?q=orchard");
  await expect(page.locator("[data-row-prompt]").first()).toBeVisible();
});

test("a search narrows the library and Clear brings it back", async ({ page }) => {
  await page.goto("/generations");
  const all = await page.locator("[data-generation-card]").count();

  await page.getByRole("searchbox", { name: "Search prompts…" }).fill("orchard");
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/q=orchard/);
  await expect(cardFor(page, IMAGES.shared.prompt)).toBeVisible();
  const found = await page.locator("[data-generation-card]").count();
  expect(found).toBeLessThan(all);

  await page.goto("/generations");
  await expect(page.locator("[data-generation-card]")).toHaveCount(all);
});

test("a search survives paging", async ({ page }) => {
  await page.goto("/settings");
  await page.locator('[name="page_size"]').fill("2");
  await page.getByRole("button", { name: /save/i }).first().click();

  await page.goto("/generations?q=a");
  const firstPage = await page.locator("[data-generation-card]").count();
  expect(firstPage).toBeLessThanOrEqual(2);

  await page.getByRole("link", { name: /next/i }).first().click();
  await expect(page).toHaveURL(/q=a/);

  await page.goto("/settings");
  await page.locator('[name="page_size"]').fill(String(PAGE_SIZE));
  await page.getByRole("button", { name: /save/i }).first().click();
});

test("a card's pop-up shows the prompt, copies it, and edits it in place", async ({ page }) => {
  await page.goto("/generations");

  const card = cardFor(page, IMAGES.collected.prompt);
  await card.getByRole("button", { name: "Show Prompt" }).click();

  const modal = page.locator("#prompt-modal");
  await expect(modal).toBeVisible();
  await expect(page.locator("#prompt-modal-text")).toHaveText(IMAGES.collected.prompt);

  await page.locator("#prompt-modal-copy").click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(IMAGES.collected.prompt);

  const edited = `${IMAGES.collected.prompt} at night`;
  await page.locator("#prompt-modal-edit-start").click();
  await page.locator("#prompt-modal-edit").fill(edited);
  await page.locator("#prompt-modal-save").click();
  await expect(page.locator("#prompt-modal-text")).toHaveText(edited);
  await expect(page.locator(`[data-prompt-show][data-prompt="${edited}"]`)).toHaveCount(1);
  await page.locator("[data-prompt-close]").first().click();
  await expect(modal).toBeHidden();

  await page.goto("/generations?q=at+night");
  await expect(page.locator(`[data-prompt-show][data-prompt="${edited}"]`)).toHaveCount(1);

  await page.goto("/generations");
  await cardFor(page, edited).getByRole("button", { name: "Show Prompt" }).click();
  await page.locator("#prompt-modal-edit-start").click();
  await page.locator("#prompt-modal-edit").fill(IMAGES.collected.prompt);
  await page.locator("#prompt-modal-save").click();
  await expect(page.locator("#prompt-modal-text")).toHaveText(IMAGES.collected.prompt);
});

test("Select reveals the checkboxes, and a bulk delete names what it will remove", async ({
  page,
}) => {
  await page.goto("/generate");
  const prompt = `a picture for the bulk bar ${Date.now()}`;
  await page.locator("#prompt").fill(prompt);
  await page.locator("#generate-btn").click();
  await expect(page.locator("#image")).toBeVisible({ timeout: 30_000 });
  await page.locator("#save-btn").click();
  await expect(page.locator("#view-link")).toBeVisible();

  await page.goto("/generations");
  await expect(page.locator("[data-bulk-cell]").first()).toBeHidden();

  await page.locator("[data-bulk-start]").click();
  await expect(page.locator("[data-bulk-cell]").first()).toBeVisible();

  await cardFor(page, prompt).getByRole("checkbox").check();
  await expect(page.locator("[data-bulk-count]")).toContainText("1");

  await page.locator('[formaction$="/bulk-delete"]').click();
  await expect(page.getByText(prompt)).toBeVisible();
  await page.getByRole("button", { name: /delete/i }).last().click();

  await expect(page.locator(`[data-prompt-show][data-prompt="${prompt}"]`)).toHaveCount(0);
});

test("one image downloads on its own, and the whole library as a zip", async ({ page }) => {
  await page.goto("/generations");

  const single = await downloadTo(page, () =>
    cardFor(page, IMAGES.favourite.prompt).getByRole("link", { name: "Download" }).click()
  );
  expect(single.suggestedFilename).toMatch(/\.png$/);

  const all = await downloadTo(page, () =>
    page.getByRole("link", { name: "Download all" }).click()
  );
  expect(all.suggestedFilename).toMatch(/\.zip$/);
  expect(looksLikeZip(all.path)).toBe(true);

  const entries = await zipEntries(all.path);
  expect(entries.length).toBeGreaterThanOrEqual(3);
});

test("a selection downloads as a zip of just those images", async ({ page }) => {
  await page.goto("/generations");
  await page.locator("[data-bulk-start]").click();
  await cardFor(page, IMAGES.favourite.prompt).getByRole("checkbox").check();

  const zip = await downloadTo(page, () =>
    page.locator('[formaction$="/bulk-download"]').click()
  );
  expect(zip.suggestedFilename).toMatch(/\.zip$/);
  expect(await zipEntries(zip.path)).toHaveLength(1);
});
