/**
 * Logging in and out.
 */

"use strict";

const { expect, test } = require("@playwright/test");
const { ADMIN, signIn, signOut } = require("./support/app");

test.describe("signing in", () => {
  test("the admin signs in and reaches the dashboard", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();

    await page.getByLabel("Username").fill(ADMIN.username);
    await page.getByLabel("Password").fill(ADMIN.password);
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  });

  test("a wrong password is refused without saying whether the user exists", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill(ADMIN.username);
    await page.getByLabel("Password").fill("not-the-right-password");
    await page.getByRole("button", { name: "Log in" }).click();

    const knownUser = (await page.getByRole("alert").textContent()).trim();
    expect(knownUser.length).toBeGreaterThan(0);

    await page.goto("/login");
    await page.getByLabel("Username").fill("no-such-user");
    await page.getByLabel("Password").fill("not-the-right-password");
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page.getByRole("alert")).toHaveText(knownUser);
  });

  test("an anonymous visitor is sent to the login page", async ({ page }) => {
    await page.goto("/generations");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
  });
});

test.describe("the session", () => {
  test("survives a reload", async ({ page }) => {
    await signIn(page);
    await page.goto("/prompts");
    await page.reload();

    await expect(page).toHaveURL(/\/prompts/);
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  });

  test("ends on logout, and the admin is closed again", async ({ page }) => {
    await signIn(page);
    await signOut(page);

    await page.goto("/generations");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("the health check", () => {
  test("answers without a session", async ({ request }) => {
    const res = await request.get("/health");
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
