/**
 * Regression: cross-group follow-ups
 */

"use strict";

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-pass";
process.env.ALLOWED_IPS = "";
process.env.TRUST_PROXY = "";

const test = require("node:test");
const assert = require("node:assert/strict");

const { freshDb, startApp, signIn } = require("../../helpers/app");
const { buildModels } = require("../../../models");

test("an empty-trash confirmation with over 1000 ids is not refused", async () => {
  const db = freshDb();
  const app = await startApp({ db });
  try {
    const cookie = await signIn(app.base);
    const html = await (
      await fetch(`${app.base}/trash`, { headers: { cookie } })
    ).text();
    const csrf = /name="_csrf" value="([^"]+)"/.exec(html)[1];
    const fields = [
      ["_csrf", csrf],
      ["confirm", "1"],
    ];
    for (let i = 1; i <= 1500; i++) fields.push(["ids", String(i)]);
    const res = await fetch(`${app.base}/trash/empty`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        cookie,
      },
      body: new URLSearchParams(fields).toString(),
      redirect: "manual",
    });
    assert.notEqual(res.status, 413);
    assert.ok(res.status < 400, `status ${res.status}`);
  } finally {
    app.stop();
    db.close();
  }
});

test("prompts with the same name are listed in id order", () => {
  const db = freshDb();
  const { Prompt } = buildModels(db);
  const ids = ["b", "B", "b"].map((name) => Prompt.add(name, "x"));
  const order = Prompt.all()
    .filter((p) => p.name.toLowerCase() === "b")
    .map((p) => p.id);
  assert.deepEqual(
    order,
    [...ids].sort((a, b) => a - b)
  );
  db.close();
});
