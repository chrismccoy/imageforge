/**
 * IP gate
 *
 * Localhost is always allowed. Any other client IP has to be in the allow list
 */

"use strict";

const { env } = require("../config/env");
const { respond } = require("../utils/http/http");
const { denied } = require("../utils/http/pages");
const { toTrimmedString } = require("../utils/domain/coerce");

/**
 * Strip the IPv4 in IPv6 prefix
 */
function normalize(ip) {
  let out = toTrimmedString(ip);
  if (out.startsWith("::ffff:")) out = out.slice(7);
  return out;
}

/**
 * Whether an IP is a localhost address.
 */
function isLocalhost(ip) {
  return ip === "::1" || ip === "127.0.0.1" || ip.startsWith("127.");
}

/**
 * Build the list of allowed addresses.
 */
function createIpAllow({ allowedIps = env.ALLOWED_IPS } = {}) {
  const allowList = allowedIps.map(normalize);

  return function ipAllow(req, res, next) {
    const ip = normalize(req.ip);
    if (isLocalhost(ip) || allowList.includes(ip)) {
      return next();
    }
    return respond(req, res, {
      status: 403,
      message: "Access denied.",
      html: () => denied(res),
    });
  };
}

module.exports = { createIpAllow };
