/**
 * End to end configuration.
 */

"use strict";

const path = require("path");
const { defineConfig, devices } = require("@playwright/test");

const ROOT = __dirname;
const E2E_DIR = path.join(ROOT, "var", "e2e");

const appPort = process.env.E2E_PORT ?? "3200";
const stubPort = process.env.E2E_STUB_PORT ?? "3199";

const baseURL = `http://127.0.0.1:${appPort}`;
const stubURL = `http://127.0.0.1:${stubPort}`;

const appEnv = {
  ...process.env,

  NODE_ENV: "test",
  PORT: appPort,

  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD: "e2e-password",
  SESSION_SECRET: "e2e-session-secret-value-at-least-32-chars",
  SETTINGS_ENC_KEY:
    "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",

  IMAGEFORGE_DB: path.join(E2E_DIR, "e2e.db"),
  IMAGEFORGE_UPLOADS: path.join(E2E_DIR, "uploads"),
  IMAGEFORGE_BACKUPS: path.join(E2E_DIR, "backups"),

  OPENAI_API_KEY: "e2e-test-key",
  OPENAI_BASE_URL: `${stubURL}/v1`,
  OPENAI_MODEL: "1.5",

  ALLOWED_IPS: "",
  TRUST_PROXY: "false",
  PUBLIC_SHARE: "true",
  PUBLIC_GALLERY: "true",
  PUBLIC_SHARE_SLUG: "false",
  PUBLIC_COLLECTIONS: "true",
  PUBLIC_FAVOURITES: "true",
  GENERATIONS_PER_PAGE: "24",
  UPLOAD_QUOTA_MB: "500",
  UPLOAD_MAX_MB: "10",
  EDIT_MAX_MB: "12",
  IMPORT_MAX_KB: "1024",

  RATE_LIMIT_LOGIN_MAX: "100000",
  RATE_LIMIT_GENERATE_MAX: "100000",
  RATE_LIMIT_SAVE_MAX: "100000",
  RATE_LIMIT_SHARE_MAX: "100000",
  RATE_LIMIT_SHARE_ZIP_MAX: "100000",
  BRAND_NAME: "",
  BRAND_ICON: "",
};

module.exports = defineConfig({
  testDir: path.join(ROOT, "tests", "e2e"),

  timeout: 45_000,
  expect: { timeout: 10_000 },

  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),

  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],

  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: process.env.CI ? "retain-on-failure" : "off",
    actionTimeout: 10_000,
    permissions: ["clipboard-read", "clipboard-write"],
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
  ],

  webServer: [
    {
      command: "node tests/e2e/stub-server.js",
      url: `${stubURL}/__stub/health`,
      env: { ...process.env, E2E_STUB_PORT: stubPort },
      cwd: ROOT,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "node scripts/seed-e2e.js && node server.js",
      url: `${baseURL}/health`,
      env: appEnv,
      cwd: ROOT,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
