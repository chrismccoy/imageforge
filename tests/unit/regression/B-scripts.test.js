/**
 * Tooling scripts: the minimal test reporter and the uncommented tests list.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..", "..");

// Minor: skips, todos and suites are not counted as passes.
test("the minimal reporter counts only real tests, skips apart", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-reg-reporter-"));
  try {
    const file = path.join(dir, "sample.test.js");
    fs.writeFileSync(
      file,
      [
        'const { test, describe } = require("node:test");',
        "test('passes', () => {});",
        "test('fails', () => { throw new Error('no'); });",
        "test.skip('skipped', () => {});",
        "test.todo('todo');",
        "describe('suite', () => { test('inner', () => {}); });",
      ].join("\n")
    );
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const res = spawnSync(
      process.execPath,
      [
        "--test",
        `--test-reporter=${path.join(ROOT, "scripts", "minimal-reporter.js")}`,
        file,
      ],
      { encoding: "utf8", cwd: dir, env }
    );
    assert.match(res.stdout, /count: 5 pass: 2 fail: 1 skip: 2/, res.stdout);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Minor: test files in subfolders of tests/ are found.
test("uncommented-tests finds tests in nested folders", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-reg-uncommented-"));
  try {
    fs.mkdirSync(path.join(dir, "tests", "unit", "a"), { recursive: true });
    fs.mkdirSync(path.join(dir, "tests", "unit", "b"), { recursive: true });
    const body = "// commented\ntest('one', () => {});\n\ntest('two', () => {});\n";
    fs.writeFileSync(path.join(dir, "tests", "unit", "a", "same.test.js"), body);
    fs.writeFileSync(path.join(dir, "tests", "unit", "b", "same.test.js"), body);

    const res = spawnSync(
      "python3",
      ["-I", path.join(ROOT, "scripts", "uncommented-tests.py")],
      { encoding: "utf8", cwd: dir }
    );
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /2 of 4 tests have no comment above them/);
    assert.match(res.stdout, /unit\/a\/same\.test\.js/);
    assert.match(res.stdout, /unit\/b\/same\.test\.js/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Minor: the default e2e run has no system Chrome project; --project=chrome adds it.
test("the default e2e run leaves out the chrome channel", () => {
  const names = (args, env = {}) => {
    const res = spawnSync(
      process.execPath,
      [
        "-e",
        "const c = require(process.argv[1]); console.log(JSON.stringify(c.projects.map((p) => p.name)));",
        path.join(ROOT, "playwright.config.js"),
        ...args,
      ],
      { encoding: "utf8", env: { ...process.env, E2E_CHROME: "", ...env } }
    );
    assert.equal(res.status, 0, res.stderr);
    return JSON.parse(res.stdout.trim().split("\n").pop());
  };
  assert.deepEqual(names([]), ["chromium"]);
  assert.deepEqual(names(["--project=chrome"]), ["chromium", "chrome"]);
  assert.deepEqual(names(["--project", "chrome"]), ["chromium", "chrome"]);
  assert.deepEqual(names([], { E2E_CHROME: "1" }), ["chromium", "chrome"]);
});
