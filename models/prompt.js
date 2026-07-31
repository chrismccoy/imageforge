/**
 * Prompt model
 *
 * Reads and writes the saved prompts that fill the menu on the Generate page.
 */

"use strict";

const { ALLOWED_SIZES, MODEL_TOKENS } = require("../config/images");
const { statementCache } = require("./criteria");
const { parseId } = require("../utils/domain/coerce");

/**
 * Build the prompt model against a database connection.
 */
module.exports = (db) => {
  const stmts = {
    all: db.prepare(
      `SELECT p.id, p.name, p.prompt, p.created_at, p.category_id, p.rating,
         p.default_size, p.default_model, p.notes, p.pinned,
         c.name AS category_name,
         (SELECT COUNT(*) FROM live_generations g WHERE g.prompt_id = p.id) AS uses
       FROM prompts p
       LEFT JOIN categories c ON c.id = p.category_id
       ORDER BY p.pinned DESC, p.name COLLATE NOCASE ASC`
    ),
    get: db.prepare(
      `SELECT id, name, prompt, created_at, category_id, rating,
         default_size, default_model, notes, pinned
       FROM prompts WHERE id = ?`
    ),
    insert: db.prepare(
      `INSERT INTO prompts (name, prompt, created_at, category_id, default_size, default_model, notes)
       VALUES (@name, @prompt, @created_at, @category_id, @default_size, @default_model, @notes)`
    ),
    update: db.prepare(
      `UPDATE prompts SET name = @name, prompt = @prompt, category_id = @category_id,
         default_size = @default_size, default_model = @default_model, notes = @notes
       WHERE id = @id`
    ),
    remove: db.prepare("DELETE FROM prompts WHERE id = ?"),
    setRating: db.prepare("UPDATE prompts SET rating = ? WHERE id = ?"),
    setPinned: db.prepare("UPDATE prompts SET pinned = ? WHERE id = ?"),
    getRating: db.prepare("SELECT rating FROM prompts WHERE id = ?"),
  };

  const stmt = statementCache(db);

  /**
   * A stored preference
   */
  function oneOf(value, allowed) {
    const clean = String(value == null ? "" : value).trim();
    return allowed.includes(clean) ? clean : null;
  }

  /**
   * A note as it should be stored, or null when there is nothing in it.
   */
  function note(value) {
    const clean = String(value == null ? "" : value).trim();
    return clean || null;
  }

  /**
   * The WHERE clause and bound values for a set of criteria.
   */
  function where({ search, categoryId }) {
    const conditions = [];
    const params = {};

    if (search) {
      conditions.push(
        `(p.name LIKE @search ESCAPE '\\'
          OR p.prompt LIKE @search ESCAPE '\\'
          OR p.notes LIKE @search ESCAPE '\\')`
      );
      params.search = search;
    }

    const category = parseId(categoryId);

    if (categoryId === "none") {
      conditions.push("p.category_id IS NULL");
    } else if (category) {
      conditions.push("p.category_id = @categoryId");
      params.categoryId = category;
    }

    const clause = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
    return { clause, params };
  }

  const ORDERS = {
    name: "p.name COLLATE NOCASE ASC",
    rating: "p.rating IS NULL, p.rating DESC, p.name COLLATE NOCASE ASC",
  };

  const PINNED_FIRST = "p.pinned DESC, ";

  /**
   * The ORDER BY fragment for a sort key.
   */
  function orderBy(sort) {
    return PINNED_FIRST + (ORDERS[sort] || ORDERS.name);
  }

  return {
    /**
     * List every prompt in name order, each with how many images used it.
     */
    all() {
      return stmts.all.all();
    },

    /**
     * Count every saved prompt.
     */
    count(criteria = {}) {
      const { clause, params } = where(criteria);
      return stmt(
        `SELECT COUNT(*) AS n FROM prompts p
         LEFT JOIN categories c ON c.id = p.category_id${clause}`
      ).get(params).n;
    },

    /**
     * List one page of prompts in name order, each with how many images used it.
     */
    page({ search = null, categoryId = null, sort = null, limit, offset } = {}) {
      const { clause, params } = where({ search, categoryId });
      return stmt(
        `SELECT p.id, p.name, p.prompt, p.created_at, p.category_id, p.rating,
           p.default_size, p.default_model, p.notes, p.pinned,
           c.name AS category_name,
           (SELECT COUNT(*) FROM live_generations g WHERE g.prompt_id = p.id) AS uses
         FROM prompts p
         LEFT JOIN categories c ON c.id = p.category_id${clause}
         ORDER BY ${orderBy(sort)}
         LIMIT @limit OFFSET @offset`
      ).all({ ...params, limit, offset });
    },

    /**
     * Get one prompt by id.
     */
    get(id) {
      return stmts.get.get(id) ?? null;
    },

    /**
     * Add a new prompt.
     */
    add(name, prompt, categoryId, fields = {}) {
      return Number(
        stmts.insert.run({
          name,
          prompt,
          created_at: new Date().toISOString(),
          category_id: parseId(categoryId),
          default_size: oneOf(fields.size, ALLOWED_SIZES),
          default_model: oneOf(fields.model, MODEL_TOKENS),
          notes: note(fields.notes),
        }).lastInsertRowid
      );
    },

    /**
     * Change a prompt's name, text, and the optional fields beside them.
     */
    update(id, name, prompt, categoryId, fields = {}) {
      return (
        stmts.update.run({
          id,
          name,
          prompt,
          category_id: parseId(categoryId),
          default_size: oneOf(fields.size, ALLOWED_SIZES),
          default_model: oneOf(fields.model, MODEL_TOKENS),
          notes: note(fields.notes),
        }).changes > 0
      );
    },

    /**
     * Delete a prompt by id.
     */
    remove(id) {
      return stmts.remove.run(id).changes > 0;
    },

    /**
     * Pin a prompt to the top of the list, or take the pin off.
     */
    setPinned(id, on) {
      stmts.setPinned.run(on ? 1 : 0, id);
      const row = stmts.get.get(id);
      return row ? row.pinned : 0;
    },

    /**
     * Set or clear a prompt's rating, and report what is now stored.
     */
    setRating(id, value) {
      const n = typeof value === "number" && Number.isInteger(value) ? value : null;
      if (n !== null && n >= 0 && n <= 5) {
        stmts.setRating.run(n === 0 ? null : n, id);
      }
      const row = stmts.getRating.get(id);
      return row ? row.rating : null;
    },
  };
};
