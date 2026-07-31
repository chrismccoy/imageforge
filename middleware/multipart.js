/**
 * Multipart bodies
 */

"use strict";

const { readableBytes } = require("../utils/domain/format");
const { requireCsrf } = require("./csrf");

/**
 * Why a parse failed
 */
function reasonFor(err, { maxBytes, maxFiles, tooLarge, tooMany, unreadable }) {
  if (err.code === "LIMIT_FILE_SIZE") {
    return typeof tooLarge === "function"
      ? tooLarge(readableBytes(maxBytes))
      : tooLarge;
  }
  if (err.code === "LIMIT_FILE_COUNT" && tooMany) {
    return typeof tooMany === "function" ? tooMany(maxFiles) : tooMany;
  }
  return unreadable;
}

/**
 * Run a parser, recording why it refused on `req.uploadError`.
 */
function parseAndRecord(parser, messages) {
  return [
    function (req, res, next) {
      parser(req, res, (err) => {
        if (err) req.uploadError = reasonFor(err, messages);
        next();
      });
    },
    requireCsrf,
  ];
}

/**
 * Run a parser, answering 400 JSON when it refuses.
 */
function parseOrRefuse(parser, messages) {
  return [
    function (req, res, next) {
      parser(req, res, (err) => {
        if (err) return res.status(400).json({ message: reasonFor(err, messages) });
        next();
      });
    },
    requireCsrf,
  ];
}

module.exports = { parseAndRecord, parseOrRefuse };
