/**
 * Moving prompts between installs.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const { expect, test } = require("@playwright/test");
const { signIn, uniqueName, downloadTo } = require("./support/app");
const { PROMPTS } = require("./support/seed");

function fileWith(contents, label) {
  const file = path.join(os.tmpdir(), `imageforge-${label}-${Date.now()}.json`);
  fs.writeFileSync(
    file,
    typeof contents === "string" ? contents : JSON.stringify(contents, null, 2)
  );
  return file;
}

function rowFor(page, name) {
  return page.locator("[data-prompt-row]").filter({ hasText: name }).first();
}

async function deletePrompt(page, name) {
  await page.goto("/prompts");
  const row = rowFor(page, name);
  await row.getByRole("button", { name: "Delete" }).click();
  await row.getByRole("button", { name: /^(Delete|Yes)/ }).click();
  await expect(rowFor(page, name)).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await page.goto("/prompts/backup");
});

test("the export holds every saved prompt, with its category and rating", async ({ page }) => {
  const { suggestedFilename, path: file } = await downloadTo(page, () =>
    page.getByRole("link", { name: "Export all prompts" }).click()
  );

  expect(suggestedFilename).toMatch(/\.json$/);
  const exported = JSON.parse(fs.readFileSync(file, "utf8"));
  const entries = Array.isArray(exported) ? exported : exported.prompts;

  const names = entries.map((entry) => entry.name);
  for (const prompt of Object.values(PROMPTS)) {
    expect(names).toContain(prompt.name);
  }

  const pinned = entries.find((entry) => entry.name === PROMPTS.pinned.name);
  expect(pinned.rating).toBe(PROMPTS.pinned.rating);
  expect(pinned.prompt).toBe(PROMPTS.pinned.prompt);
});

test("importing the same file again skips every prompt and names them", async ({ page }) => {
  const { path: file } = await downloadTo(page, () =>
    page.getByRole("link", { name: "Export all prompts" }).click()
  );

  await page.goto("/prompts/backup");
  await page.locator("#import-file").setInputFiles(file);
  await page.getByRole("button", { name: "Import" }).click();

  await expect(page.getByText(`Skipped ${Object.keys(PROMPTS).length}`)).toBeVisible();
  await page.getByText("Which were skipped").click();
  await expect(page.getByText(PROMPTS.pinned.name)).toBeVisible();
  await page.goto("/prompts");
  await expect(page.locator("[data-prompt-row]")).toHaveCount(
    Object.keys(PROMPTS).length
  );
});

test("a file with one new prompt imports exactly that one", async ({ page }) => {
  const name = uniqueName("Imported");
  const file = fileWith([{ name, prompt: "A lighthouse in fog", rating: 4 }], "one");

  await page.locator("#import-file").setInputFiles(file);
  await page.getByRole("button", { name: "Import" }).click();

  await page.goto("/prompts");
  await expect(rowFor(page, name)).toBeVisible();
  await expect(page.locator("[data-prompt-row]")).toHaveCount(
    Object.keys(PROMPTS).length + 1
  );

  await deletePrompt(page, name);
});

test("a broken entry is counted and the good ones still arrive", async ({ page }) => {
  const first = uniqueName("Imported");
  const second = uniqueName("Imported");
  const file = fileWith(
    [
      { name: first, prompt: "A harbour at night" },
      { name: "", prompt: "" },
      { name: second, prompt: "A field of barley" },
    ],
    "mixed"
  );

  await page.locator("#import-file").setInputFiles(file);
  await page.getByRole("button", { name: "Import" }).click();

  await page.goto("/prompts");
  await expect(rowFor(page, first)).toBeVisible();
  await expect(rowFor(page, second)).toBeVisible();

  await deletePrompt(page, first);
  await deletePrompt(page, second);
});

test("a file holding more than a thousand prompts is refused", async ({ page }) => {
  const many = Array.from({ length: 1001 }, (unused, index) => ({
    name: `Too many ${index}`,
    prompt: `Prompt number ${index}`,
  }));
  const file = fileWith(many, "many");

  await page.locator("#import-file").setInputFiles(file);
  await page.getByRole("button", { name: "Import" }).click();

  await page.goto("/prompts");
  await expect(page.locator("[data-prompt-row]")).toHaveCount(
    Object.keys(PROMPTS).length
  );
});

test("a file that is not prompts at all is refused without storing anything", async ({ page }) => {
  const file = fileWith("this is not JSON at all", "broken");

  await page.locator("#import-file").setInputFiles(file);
  await page.getByRole("button", { name: "Import" }).click();

  await page.goto("/prompts");
  await expect(page.locator("[data-prompt-row]")).toHaveCount(
    Object.keys(PROMPTS).length
  );
});
