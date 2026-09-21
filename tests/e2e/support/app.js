/**
 * Shared helpers
 */

"use strict";

const { expect } = require("@playwright/test");

const ADMIN = { username: "admin", password: "e2e-password" };

const STUB_URL = `http://127.0.0.1:${process.env.E2E_STUB_PORT || 3199}`;

function field(scope, name) {
  return scope.locator(`[name="${name}"]:not([type="hidden"])`);
}

function uniqueSlug() {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`.replace(
    /[^a-z0-9]/g,
    ""
  );
}

function uniqueName(prefix) {
  return `${prefix} ${uniqueSlug()}`;
}

async function signIn(page, options = {}) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(options.username ?? ADMIN.username);
  await page.getByLabel("Password").fill(options.password ?? ADMIN.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function signOut(page) {
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login/);
}

async function paint(page, locator, points, options = {}) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("Cannot paint on an element with no box.");

  const at = ([fx, fy]) => ({
    x: box.x + box.width * fx,
    y: box.y + box.height * fy,
  });

  const first = at(points[0]);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const point of points.slice(1)) {
    const next = at(point);
    await page.mouse.move(next.x, next.y, { steps: options.steps ?? 10 });
  }
  await page.mouse.up();
}

async function dragBox(page, locator, rect) {
  await paint(page, locator, [rect.from, rect.to], { steps: 20 });
}

async function resetStub(request) {
  await request.post(`${STUB_URL}/__stub/reset`);
}

async function armStubFailure(request, failure) {
  await request.post(`${STUB_URL}/__stub/fail-next`, { data: failure });
}

async function stubRequests(request) {
  return (await request.get(`${STUB_URL}/__stub/requests`)).json();
}

function cardFor(page, prompt) {
  return page
    .locator("[data-generation-card]")
    .filter({ has: page.locator(`[data-prompt-show][data-prompt="${prompt}"]`) })
    .first();
}

function modelRadio(scope, token) {
  return scope.locator(`[data-model-strip] input[name="model"][value="${token}"]`);
}

async function pickModel(scope, token) {
  await modelRadio(scope, token).setChecked(true, { force: true });
}

async function downloadTo(page, action) {
  const [download] = await Promise.all([page.waitForEvent("download"), action()]);
  return {
    suggestedFilename: download.suggestedFilename(),
    path: await download.path(),
  };
}

module.exports = {
  ADMIN,
  STUB_URL,
  field,
  uniqueSlug,
  uniqueName,
  signIn,
  signOut,
  paint,
  dragBox,
  resetStub,
  armStubFailure,
  stubRequests,
  downloadTo,
  cardFor,
  modelRadio,
  pickModel,
};
