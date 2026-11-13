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
 * Lowercase, strip the IPv4 in IPv6 prefix, and write IPv6 in its short form.
 */
function normalize(ip) {
  let out = toTrimmedString(ip).toLowerCase();
  if (out.startsWith("::ffff:") && out.includes(".")) out = out.slice(7);
  if (out.includes(":")) {
    try {
      out = new URL(`http://[${out}]/`).hostname.slice(1, -1);
    } catch {
      // not an IPv6 address, compared as written
    }
  }
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
