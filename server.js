/**
 * Image Forge
 */

"use strict";

const path = require("path");

const express = require("express");

const { openDatabase } = require("./db");
const { buildModels, initSchema } = require("./models");
const { createOpenaiCredentials } = require("./services/openaiCredentials");
const { createPendingImages } = require("./services/pendingImages");
const { createUploadsUsage } = require("./services/uploadsUsage");
const { createPublicAccess } = require("./services/publicAccess");
const { createSessionMiddleware } = require("./middleware/session");
const { viewContext } = require("./middleware/viewContext");
const { settingsRow } = require("./middleware/settingsRow");
const { createBrand } = require("./middleware/brand");
const { createIpAllow } = require("./middleware/ipAllow");
const { chromeFigures } = require("./middleware/chrome");
const { createSecurityHeaders } = require("./middleware/securityHeaders");
const { proxyCheck } = require("./middleware/proxyCheck");
const { createErrorHandler } = require("./middleware/errorHandler");
const buildRouter = require("./routes");
const { env, PROXY_TRUST, assertConfig } = require("./config/env");
const { JSON_BODY_LIMIT, resolveLimits } = require("./config/limits");
const { NAV_LINKS, NAV_GROUPS } = require("./config/navigation");
const { PAGES, UPLOAD_PREFIX } = require("./config/urls");
const { resolveBrand } = require("./config/brand");
const { CARRIED } = require("./controllers/support/helpers/generationCriteria");
const { uploadsDirFor } = require("./utils/files/uploads");

/**
 * Build the app over an open database connection.
 */
function createApp({
  db,
  folders = {},
  allowedIps,
  limits = {},
  log = console,
  trustProxy = PROXY_TRUST,
} = {}) {
  const models = buildModels(initSchema(db));
  const openaiCredentials = createOpenaiCredentials(models.Settings);
  const pending = createPendingImages();
  const usage = createUploadsUsage({ dir: uploadsDirFor(folders) });
  const access = createPublicAccess(models.Settings);
  const ipAllow = createIpAllow(allowedIps ? { allowedIps } : {});
  const deps = {
    db,
    models,
    openaiCredentials,
    pending,
    usage,
    access,
    ipAllow,
    folders,
    limits: resolveLimits(limits),
    log,
    chromeFigures: chromeFigures({ models, usage }),
  };

  deps.generateController = require("./controllers/generateController")(deps);
  deps.editController = require("./controllers/editController")(deps);
  deps.cropController = require("./controllers/cropController")(deps);

  const app = express();

  // Behind a reverse proxy, trust only its hops so req.ip is the real client address the IP allow checks.
  if (trustProxy) {
    app.set("trust proxy", trustProxy);
  }

  // Warn once per problem if the TRUST_PROXY setting is wrong for the actual deployment.
  app.use(proxyCheck(log.warn));

  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));

  Object.assign(app.locals, {
    navLinks: NAV_LINKS,
    navGroups: NAV_GROUPS,
    adminUser: env.ADMIN_USERNAME,

    uploadPrefix: UPLOAD_PREFIX,

    pages: PAGES,

    carried: CARRIED,

    brand: resolveBrand({}, env),
  });

  const session = createSessionMiddleware(db);

  app.use(settingsRow(models.Settings));

  app.use(createBrand());

  app.use(createSecurityHeaders());
  // The empty-trash confirmation posts one id per image.
  app.use(express.urlencoded({ extended: false, parameterLimit: 10000 }));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(session);
  app.use(viewContext);

  app.use("/", buildRouter(deps));

  app.use(createErrorHandler({ log }));

  deps.close = () => {
    pending.close();
    session.store.close();
  };

  app.set("deps", deps);
  return app;
}

const SHUTDOWN_GRACE_MS = 10 * 1000;

/**
 * Build the signal handler: stop taking requests, then exit, forced after a grace period.
 */
function createShutDown({
  server,
  close,
  exit = process.exit,
  graceMs = SHUTDOWN_GRACE_MS,
}) {
  let stopping = false;

  return function shutDown() {
    if (stopping) return;
    stopping = true;

    setTimeout(() => exit(1), graceMs).unref();
    server.close(() => {
      close();
      exit(0);
    });
    server.closeIdleConnections();
  };
}

// When run directly, refuse an unsafe production config
if (require.main === module) {
  assertConfig();
  const db = openDatabase();
  const app = createApp({ db });
  const server = app.listen(env.PORT, () => {
    console.log(`Image Forge running on http://localhost:${env.PORT}`);
  });

  const shutDown = createShutDown({
    server,
    close: () => {
      app.get("deps").close();
      db.close();
    },
  });
  process.on("SIGINT", shutDown);
  process.on("SIGTERM", shutDown);
}

module.exports = { createApp, createShutDown };
