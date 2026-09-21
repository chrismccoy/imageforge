/**
 * Uploading your own images.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const { expect, test } = require("@playwright/test");
const { signIn, field, uniqueSlug } = require("./support/app");
const { PROMPTS } = require("./support/seed");

const FIXTURES = path.join(__dirname, "fixtures");
const SMALL = path.join(FIXTURES, "upload-small.png");
const PORTRAIT = path.join(FIXTURES, "seed-portrait.png");
const LANDSCAPE = path.join(FIXTURES, "seed-landscape.png");
const NOT_AN_IMAGE = path.join(FIXTURES, "upload-not-an-image.txt");

function oversizedFile() {
  const file = path.join(os.tmpdir(), `imageforge-oversize-${process.pid}.png`);
  if (!fs.existsSync(file)) {
    const png = fs.readFileSync(SMALL);
    fs.writeFileSync(file, Buffer.concat([png, Buffer.alloc(11 * 1024 * 1024)]));
  }
  return file;
}

async function dropFiles(page, files) {
  const payload = files.map((file) => ({
    name: path.basename(file),
    mime: file.endsWith(".png") ? "image/png" : "text/plain",
    buffer: fs.readFileSync(file).toString("base64"),
  }));

  const transfer = await page.evaluateHandle(async (items) => {
    const carrier = new DataTransfer();
    for (const item of items) {
      const bytes = Uint8Array.from(atob(item.buffer), (c) => c.charCodeAt(0));
      carrier.items.add(new File([bytes], item.name, { type: item.mime }));
    }
    return carrier;
  }, payload);

  await page.locator("[data-drop-zone]").dispatchEvent("drop", { dataTransfer: transfer });
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await page.goto("/upload");
});

test("choosing several files shows a preview of each before anything is sent", async ({
  page,
}) => {
  await page.locator("#image").setInputFiles([SMALL, PORTRAIT, LANDSCAPE]);

  await expect(page.locator("[data-drop-preview]")).toBeVisible();
  await expect(page.locator("[data-drop-list] > *")).toHaveCount(3);
});

test("dropping files straight on the page previews them too", async ({ page }) => {
  await dropFiles(page, [SMALL, PORTRAIT]);

  await expect(page.locator("[data-drop-preview]")).toBeVisible();
  await expect(page.locator("[data-drop-list] > *")).toHaveCount(2);
});

test("a file that is not a picture is refused by name, before it is sent", async ({ page }) => {
  await dropFiles(page, [SMALL, NOT_AN_IMAGE]);

  const error = page.locator("[data-drop-error]");
  await expect(error).toBeVisible();
  await expect(error).toContainText("upload-not-an-image.txt");
});

test("a file over the limit is refused by name, before it is sent", async ({ page }) => {
  const oversize = oversizedFile();
  await dropFiles(page, [oversize]);

  const error = page.locator("[data-drop-error]");
  await expect(error).toBeVisible();
  await expect(error).toContainText(path.basename(oversize));
});

test("an upload carries the prompt, model and size chosen for the batch", async ({ page }) => {
  const prompt = `uploaded by the suite ${uniqueSlug()}`;

  await page.locator("#image").setInputFiles([SMALL, PORTRAIT]);
  await field(page, "prompt").fill(prompt);
  await field(page, "model").selectOption("2");
  await field(page, "size").selectOption("1024x1024");
  await page.getByRole("button", { name: "Upload" }).click();

  await expect(page).toHaveURL(/\/generations/);

  const cards = page.locator(`[data-prompt-show][data-prompt="${prompt}"]`);
  await expect(cards).toHaveCount(2);

  const card = page
    .locator("[data-generation-card]")
    .filter({ has: cards.first() })
    .first();
  await expect(card).toContainText("gpt-image-2");
  await expect(card).not.toContainText("tokens");
});

test("an upload can be assigned to a saved prompt", async ({ page }) => {
  await page.locator("#image").setInputFiles([SMALL]);
  await field(page, "prompt_id").selectOption({ label: PROMPTS.pinned.name });
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page).toHaveURL(/\/generations/);

  await page.goto("/prompts");
  await expect(
    page.getByRole("row", { name: new RegExp(PROMPTS.pinned.name) })
  ).toBeVisible();
});

test("one bad file among good ones does not fail the whole batch", async ({ page }) => {
  const prompt = `a mixed batch ${uniqueSlug()}`;

  const liar = path.join(os.tmpdir(), `imageforge-liar-${process.pid}.png`);
  fs.writeFileSync(liar, "GIF89a this is not a png at all");

  await page.locator("#image").setInputFiles([SMALL, liar]);
  await field(page, "prompt").fill(prompt);
  await page.getByRole("button", { name: "Upload" }).click();

  await expect(page.getByText("1 saved")).toBeVisible();
  await expect(page.getByText("1 refused")).toBeVisible();
  await expect(page.getByText(path.basename(liar))).toBeVisible();

  await page.goto("/generations");
  await expect(page.locator(`[data-prompt-show][data-prompt="${prompt}"]`)).toHaveCount(1);
});
