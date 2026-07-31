/**
 * Paginate
 */

"use strict";

/**
 * Work out the page to show from a requested page number.
 */
function paginate({ total, pageSize, rawPage }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  let page = parseInt(rawPage, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (page > totalPages) page = totalPages;

  return { page, totalPages, offset: (page - 1) * pageSize };
}

module.exports = { paginate };
