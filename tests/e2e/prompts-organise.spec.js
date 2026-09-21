/**
 * Categories, ratings and pins.
 */

"use strict";

const { expect, test } = require("@playwright/test");
const { signIn, field, uniqueName } = require("./support/app");
const { PROMPTS, CATEGORIES } = require("./support/seed");

function rowFor(page, name) {
  return page.locator("[data-prompt-row]").filter({ hasText: name }).first();
}

async function order(page) {
  return page.locator("[data-prompt-row] td:nth-child(2)").allInnerTexts();
}

async function withoutReload(page, action) {
  await page.evaluate(() => {
    window.__stillHere = true;
  });
  await action();
  return page.evaluate(() => window.__stillHere === true);
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("the category filter narrows the list to one category", async ({ page }) => {
  await page.goto("/prompts");
  await field(page, "category").selectOption({ label: CATEGORIES.portraits });
  await page.getByRole("button", { name: "Filter" }).click();

  await expect(page.locator("[data-prompt-row]")).toHaveCount(2);
  await expect(rowFor(page, PROMPTS.pinned.name)).toBeVisible();
  await expect(rowFor(page, PROMPTS.variables.name)).toBeVisible();
});

test("deleting a category leaves its prompts uncategorised", async ({ page }) => {
  const category = uniqueName("Category");
  const promptName = uniqueName("Prompt");

  await page.goto("/categories");
  await page.getByRole("textbox", { name: "New category" }).fill(category);
  await page.getByRole("button", { name: /add|create|save/i }).first().click();
  await expect(page.locator(`input[name="name"][value="${category}"]`)).toBeVisible();

  await page.goto("/prompts/new");
  await field(page, "name").fill(promptName);
  await field(page, "prompt").fill("A prompt that outlives its category");
  await field(page, "category_id").selectOption({ label: category });
  await page.getByRole("button", { name: "Save prompt" }).click();

  await page.goto("/categories");
  const row = page
    .locator("tr")
    .filter({ has: page.locator(`input[name="name"][value="${category}"]`) })
    .first();
  await row.getByRole("button", { name: /delete/i }).click();
  await row.getByRole("button", { name: /^(Delete|Yes)/ }).click();

  await page.goto("/prompts");
  const prompt = rowFor(page, promptName);
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText("—");

  await prompt.getByRole("button", { name: "Delete" }).click();
  await prompt.getByRole("button", { name: /^(Delete|Yes)/ }).click();
  await expect(rowFor(page, promptName)).toHaveCount(0);
});

test("a rating is given from the list and sorts the list", async ({ page }) => {
  await page.goto("/prompts");

  const row = rowFor(page, PROMPTS.variables.name);
  await row.getByRole("button", { name: "Rate 4" }).click();
  await expect(row.locator("[data-rating-group]")).toHaveAttribute("data-rating", "4");

  await page.getByRole("link", { name: "Rating" }).click();
  const sorted = await order(page);
  expect(sorted[0]).toContain(PROMPTS.pinned.name);

  await page.goto("/prompts");
  const again = rowFor(page, PROMPTS.variables.name);
  await again.getByRole("button", { name: "Rate 4" }).click();
  await expect(again.locator("[data-rating-group]")).toHaveAttribute("data-rating", "");
});

test("a pin moves a prompt to the top without reloading the page", async ({ page }) => {
  await page.goto("/prompts");

  const before = await order(page);
  expect(before[0]).toContain(PROMPTS.pinned.name);

  const stayed = await withoutReload(page, async () => {
    await rowFor(page, PROMPTS.noted.name)
      .getByRole("button", { name: `Pin ${PROMPTS.noted.name} to the top` })
      .click();
    await expect(
      rowFor(page, PROMPTS.noted.name).getByRole("button", {
        name: `Pin ${PROMPTS.noted.name} to the top`,
      })
    ).toHaveAttribute("aria-pressed", "true");
  });
  expect(stayed).toBe(true);

  const pinned = await order(page);
  expect(pinned.slice(0, 2).join(" ")).toContain(PROMPTS.noted.name);

  await rowFor(page, PROMPTS.noted.name)
    .getByRole("button", { name: `Pin ${PROMPTS.noted.name} to the top` })
    .click();
  await expect(
    rowFor(page, PROMPTS.noted.name).getByRole("button", {
      name: `Pin ${PROMPTS.noted.name} to the top`,
    })
  ).toHaveAttribute("aria-pressed", "false");

  expect(await order(page)).toEqual(before);
});

test("a pin taken during a search keeps the search", async ({ page }) => {
  await page.goto("/prompts?q=orchard");
  await expect(page.locator("[data-prompt-row]")).toHaveCount(1);

  await rowFor(page, PROMPTS.noted.name)
    .getByRole("button", { name: `Pin ${PROMPTS.noted.name} to the top` })
    .click();

  await expect(page).toHaveURL(/q=orchard/);
  await expect(page.locator("[data-prompt-row]")).toHaveCount(1);
  await expect(page.getByRole("searchbox", { name: "Search prompts…" })).toHaveValue(
    "orchard"
  );

  await rowFor(page, PROMPTS.noted.name)
    .getByRole("button", { name: `Pin ${PROMPTS.noted.name} to the top` })
    .click();
});

test("the generate page's picker puts pinned prompts first", async ({ page }) => {
  await page.goto("/generate");
  const options = await page.locator("#prompt-select option").allTextContents();

  expect(options[1]).toBe(PROMPTS.pinned.name);
});

test("deleting several prompts together keeps the images made from them", async ({ page }) => {
  const first = uniqueName("Bulk");
  const second = uniqueName("Bulk");

  for (const name of [first, second]) {
    await page.goto("/prompts/new");
    await field(page, "name").fill(name);
    await field(page, "prompt").fill(`Text for ${name}`);
    await page.getByRole("button", { name: "Save prompt" }).click();
  }

  await page.goto("/generations");
  const imagesBefore = await page.locator("[data-generation-card]").count();

  await page.goto("/prompts");
  await page.locator("[data-bulk-start]").click();
  for (const name of [first, second]) {
    await rowFor(page, name).getByRole("checkbox").check();
  }
  await page.locator("[data-bulk-action]").click();

  await expect(page.getByText(first)).toBeVisible();
  await page.getByRole("button", { name: /delete/i }).last().click();

  await expect(rowFor(page, first)).toHaveCount(0);
  await expect(rowFor(page, second)).toHaveCount(0);

  await page.goto("/generations");
  await expect(page.locator("[data-generation-card]")).toHaveCount(imagesBefore);
});
