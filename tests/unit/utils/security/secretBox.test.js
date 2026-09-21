/**
 * Secret box tests
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const secretBox = require("../../../../utils/security/secretBox");

const KEY_HEX = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
const KEY = Buffer.from(KEY_HEX, "hex");

test("parseKey accepts 64-char hex and 32-byte base64, rejects the rest", () => {
  assert.ok(secretBox.parseKey(KEY_HEX));
  assert.equal(secretBox.parseKey(KEY_HEX).length, 32);

  const b64 = crypto.randomBytes(32).toString("base64");
  assert.equal(secretBox.parseKey(b64).length, 32);

  assert.equal(secretBox.parseKey(""), null);
  assert.equal(secretBox.parseKey("abc"), null); 
  assert.equal(secretBox.parseKey(crypto.randomBytes(16).toString("base64")), null);
});

test("encrypt then decrypt round-trips and marks the value encrypted", () => {
  const blob = secretBox.encrypt("sk-secret-123", KEY);
  assert.ok(secretBox.isEncrypted(blob));
  assert.ok(!blob.includes("sk-secret-123")); 
  assert.equal(secretBox.decrypt(blob, KEY), "sk-secret-123");
});

test("each encryption uses a fresh IV so blobs differ", () => {
  const a = secretBox.encrypt("same", KEY);
  const b = secretBox.encrypt("same", KEY);
  assert.notEqual(a, b);
  assert.equal(secretBox.decrypt(a, KEY), secretBox.decrypt(b, KEY));
});

test("decrypt with the wrong key throws (auth tag rejects it)", () => {
  const blob = secretBox.encrypt("sk-secret-123", KEY);
  const wrong = crypto.randomBytes(32);
  assert.throws(() => secretBox.decrypt(blob, wrong));
});

test("decrypt rejects a tampered blob", () => {
  const blob = secretBox.encrypt("sk-secret-123", KEY);
  const tampered =
    blob.slice(0, 20) + (blob[20] === "A" ? "B" : "A") + blob.slice(21);
  assert.throws(() => secretBox.decrypt(tampered, KEY));
});

test("isEncrypted is false for legacy plaintext", () => {
  assert.equal(secretBox.isEncrypted("sk-plain"), false);
  assert.equal(secretBox.isEncrypted(""), false);
  assert.equal(secretBox.isEncrypted(null), false);
});

test("encrypt/decrypt without a configured key throw", () => {
  assert.throws(() => secretBox.encrypt("x", null));
  assert.throws(() => secretBox.decrypt("enc:v1:AAAA", null));
});
