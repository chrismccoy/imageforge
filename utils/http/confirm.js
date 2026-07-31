/**
 * Asking first
 */

"use strict";

const VIEW = "bulk-confirm";

/**
 * Whether this request is the confirmation rather than the first ask.
 */
function confirmed(req) {
  const value = req.body && req.body.confirm;
  return String(value == null ? "" : value) === "1";
}

/**
 * Render the confirmation page.
 */
function renderConfirm(
  res,
  { title, active, heading, detail, action, backUrl, rows, label }
) {
  return res.render(VIEW, {
    title,
    active,
    heading,
    detail,
    action,
    backUrl,
    items: rows.map((row) => ({ id: row.id, label: label(row) })),
  });
}

module.exports = { confirmed, renderConfirm, VIEW };
