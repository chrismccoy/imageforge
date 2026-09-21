/**
 * Runs the fake image API for the end-to-end suite.
 */

"use strict";

const http = require("http");
const path = require("path");

const { createStub } = require("./stub-openai");

const port = Number(process.env.E2E_STUB_PORT) || 3199;
const stub = createStub({ fixturesDir: path.join(__dirname, "fixtures") });

http.createServer(stub.handler).listen(port, "127.0.0.1", () => {
  console.log(`Fake image API on http://127.0.0.1:${port}`);
});
