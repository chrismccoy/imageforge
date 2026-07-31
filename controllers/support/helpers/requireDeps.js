/**
 * Declaring what a controller needs
 */

"use strict";

/**
 * Hand back the container, or refuse by name.
 */
function requireDeps(deps, names, who) {
  const missing = names.filter((name) => !deps || !deps[name]);
  if (missing.length) {
    throw new Error(`${who} needs deps.${missing.join(", deps.")}`);
  }
  return deps;
}

module.exports = { requireDeps };
