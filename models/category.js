/**
 * Categories
 */

"use strict";

const { buildNamedList } = require("./namedListQueries");

/**
 * Build the category model against a database connection.
 */
module.exports = (db) => {
  const stmts = {
    all: db.prepare(
      `SELECT c.id, c.name, c.created_at,
         (SELECT COUNT(*) FROM prompts p WHERE p.category_id = c.id) AS uses
       FROM categories c
       ORDER BY c.name COLLATE NOCASE ASC`
    ),
    get: db.prepare("SELECT id, name, created_at FROM categories WHERE id = ?"),
    insert: db.prepare("INSERT INTO categories (name, created_at) VALUES (?, ?)"),
    rename: db.prepare("UPDATE categories SET name = ? WHERE id = ?"),
    detach: db.prepare(
      "UPDATE prompts SET category_id = NULL WHERE category_id = ?"
    ),
    remove: db.prepare("DELETE FROM categories WHERE id = ?"),
  };

  const list = buildNamedList(db, stmts);

  return {
    /**
     * Every category in name order, with how many prompts use it.
     */
    all() {
      return stmts.all.all();
    },

    /**
     * One category by id.
     */
    get(id) {
      return stmts.get.get(id) ?? null;
    },

    /**
     * Add a category. Returns its id, or null when blank or already taken.
     */
    add: list.add,

    /**
     * Rename a category. Reports whether it took.
     */
    rename: list.rename,

    /**
     * Delete a category, detaching the prompts that used it. Reports whether
     * it took.
     */
    remove: list.remove,
  };
};
