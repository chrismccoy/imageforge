/**
 * Share tokens
 */

"use strict";

const crypto = require("crypto");

// Digits and letters only, so a token never needs escaping in a URL.
const SHARE_TOKEN_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

const SHARE_TOKEN_LENGTH = 10;

/**
 * Generate a new random share token.
 */
function newShareToken() {
  let token = "";
  while (token.length < SHARE_TOKEN_LENGTH) {
    token += SHARE_TOKEN_ALPHABET[crypto.randomInt(SHARE_TOKEN_ALPHABET.length)];
  }
  return token;
}

module.exports = { newShareToken, SHARE_TOKEN_LENGTH, SHARE_TOKEN_ALPHABET };
