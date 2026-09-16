"use strict";

const express = require("express");

module.exports = () => {
  const router = express.Router();

  router.get("/health", (req, res) => {
    res.json({ ok: true });
  });

  return router;
};
