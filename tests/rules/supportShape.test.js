/**
 * controllers/support/ holds two kinds of module
 */

"use strict";

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const SUPPORT = path.join(__dirname, "..", "..", "controllers", "support");

function modulesIn(folder) {
  return fs
    .readdirSync(path.join(SUPPORT, folder))
    .filter((name) => name.endsWith(".js"))
    .map((name) => ({
      name: `${folder}/${name}`,
      exports: require(path.join(SUPPORT, folder, name)),
    }));
}

test("every builder exports exactly one build* factory", () => {
  const builders = modulesIn("builders");
  assert.ok(builders.length, "controllers/support/builders is empty");

  for (const module of builders) {
    const names = Object.keys(module.exports);
    assert.equal(
      names.length,
      1,
      `${module.name} exports ${names.length} things. A builder is one factory.`
    );
    assert.match(
      names[0],
      /^build[A-Z]/,
      `${module.name} exports ${names[0]}, which is not a build* factory. ` +
        "A module that is not one belongs in controllers/support/helpers."
    );
    assert.equal(typeof module.exports[names[0]], "function");
  }
});

test("no helper is a build* factory", () => {
  const helpers = modulesIn("helpers");
  assert.ok(helpers.length, "controllers/support/helpers is empty");

  for (const module of helpers) {
    for (const name of Object.keys(module.exports)) {
      assert.doesNotMatch(
        name,
        /^build[A-Z]/,
        `${module.name} exports ${name}, which reads as a builder. ` +
          "A factory that closes over deps belongs in " +
          "controllers/support/builders."
      );
    }
  }
});

test("nothing sits loose at the top of controllers/support", () => {
  const loose = fs
    .readdirSync(SUPPORT, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => entry.name);

  assert.deepEqual(
    loose,
    [],
    `${loose.join(", ")} is neither a builder nor a helper. Put it in one of ` +
      "the two folders, or say in its header why it is neither."
  );
});
