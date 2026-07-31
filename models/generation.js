/**
 * Generation model
 *
 * Reads and writes the saved image records (file name, prompt, model, size).
 */

"use strict";

const { statementCache } = require("./criteria");
const { parseId } = require("../utils/domain/coerce");
const { allocateToken } = require("./allocateToken");
const { tokenCount } = require("../utils/domain/tokenCount");

const LIST_COLUMNS = `id, filename, prompt, model, size, created_at, share_token,
       favorite, edited_from,
       usage_total_tokens, usage_input_tokens, usage_output_tokens`;

/**
 * Build the generation model against a database connection.
 */
module.exports = (db) => {
  const stmts = {
    all: db.prepare(
      "SELECT id, filename, prompt, model, size, created_at, share_token, edited_from FROM live_generations ORDER BY created_at DESC, id DESC"
    ),
    get: db.prepare("SELECT * FROM live_generations WHERE id = ?"),
    insert: db.prepare(
      `INSERT INTO generations (
         filename, prompt, prompt_id, model, size, created_at, edited_from,
         spend_counted,
         usage_total_tokens, usage_input_tokens, usage_output_tokens,
         usage_input_text_tokens, usage_input_image_tokens,
         usage_output_text_tokens, usage_output_image_tokens
       ) VALUES (
         @filename, @prompt, @prompt_id, @model, @size, @created_at, @edited_from,
         @spend_counted,
         @usage_total_tokens, @usage_input_tokens, @usage_output_tokens,
         @usage_input_text_tokens, @usage_input_image_tokens,
         @usage_output_text_tokens, @usage_output_image_tokens
       )`
    ),
    remove: db.prepare("DELETE FROM generations WHERE id = ?"),
    trash: db.prepare("UPDATE generations SET deleted_at = ? WHERE id = ?"),
    restore: db.prepare("UPDATE generations SET deleted_at = NULL WHERE id = ?"),
    // Whether or not it is in the trash, for restore and purge to work on.
    getAnyState: db.prepare("SELECT * FROM generations WHERE id = ?"),
    trashed: db.prepare(
      `SELECT * FROM generations WHERE deleted_at IS NOT NULL
       ORDER BY deleted_at DESC, id DESC`
    ),
    clearPromptRef: db.prepare(
      "UPDATE generations SET prompt_id = NULL WHERE prompt_id = ?"
    ),
    getByShareToken: db.prepare(
      "SELECT * FROM live_generations WHERE share_token = ?"
    ),
    setShareToken: db.prepare(
      "UPDATE generations SET share_token = ? WHERE id = ?"
    ),
    clearShareToken: db.prepare(
      "UPDATE generations SET share_token = NULL WHERE id = ?"
    ),
    toggleFavorite: db.prepare(
      "UPDATE generations SET favorite = CASE favorite WHEN 1 THEN 0 ELSE 1 END WHERE id = ?"
    ),
    getFavorite: db.prepare("SELECT favorite FROM live_generations WHERE id = ?"),
    favouriteAnchor: db.prepare(
      "SELECT created_at FROM live_generations WHERE id = ? AND favorite = 1"
    ),
    favouritePrev: db.prepare(
      `SELECT id FROM live_generations
       WHERE favorite = 1 AND (created_at, id) > (@created_at, @id)
       ORDER BY created_at ASC, id ASC LIMIT 1`
    ),
    favouriteNext: db.prepare(
      `SELECT id FROM live_generations
       WHERE favorite = 1 AND (created_at, id) < (@created_at, @id)
       ORDER BY created_at DESC, id DESC LIMIT 1`
    ),
    countShared: db.prepare(
      "SELECT COUNT(*) AS n FROM live_generations WHERE share_token IS NOT NULL"
    ),
    pageShared: db.prepare(
      `SELECT id, filename, prompt, model, size, created_at, share_token
       FROM live_generations
       WHERE share_token IS NOT NULL
       ORDER BY created_at DESC, id DESC
       LIMIT @limit OFFSET @offset`
    ),
  };

  const stmt = statementCache(db);

  /**
   * The WHERE clause and bound values for a set of criteria.
   */
  function where({ search, favorite, collectionId, promptId }) {
    const conditions = [];
    const params = {};

    const collection = parseId(collectionId);
    const prompt = parseId(promptId);

    if (search) {
      conditions.push("prompt LIKE @search ESCAPE '\\'");
      params.search = search;
    }
    if (favorite) conditions.push("favorite = 1");

    if (collectionId === "none") {
      conditions.push(
        `NOT EXISTS (SELECT 1 FROM generation_collections gc
                     WHERE gc.generation_id = live_generations.id)`
      );
    } else if (collection) {
      conditions.push(
        `EXISTS (SELECT 1 FROM generation_collections gc
                 WHERE gc.generation_id = live_generations.id
                   AND gc.collection_id = @collectionId)`
      );
      params.collectionId = collection;
    }

    if (prompt) {
      conditions.push("prompt_id = @promptId");
      params.promptId = prompt;
    }

    const clause = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
    return { clause, params };
  }

  return {
    /**
     * List every saved image, newest first.
     */
    all() {
      return stmts.all.all();
    },

    /**
     * Count every saved image.
     */
    count(criteria = {}) {
      const { clause, params } = where(criteria);
      return stmt(`SELECT COUNT(*) AS n FROM live_generations${clause}`).get(params)
        .n;
    },

    /**
     * List one page of saved images, newest first.
     */
    page({
      search = null,
      favorite = false,
      collectionId = null,
      promptId = null,
      limit,
      offset,
    } = {}) {
      const { clause, params } = where({
        search,
        favorite,
        collectionId,
        promptId,
      });
      return stmt(
        `SELECT ${LIST_COLUMNS}
         FROM live_generations${clause}
         ORDER BY created_at DESC, id DESC
         LIMIT @limit OFFSET @offset`
      ).all({ ...params, limit, offset });
    },

    /**
     * Every starred image, newest first.
     */
    allFavourites() {
      const { clause } = where({ favorite: true });
      return stmt(
        `SELECT ${LIST_COLUMNS}
         FROM live_generations${clause}
         ORDER BY created_at DESC, id DESC`
      ).all();
    },

    /**
     * Get one saved image by id.
     */
    get(id) {
      return stmts.get.get(id) ?? null;
    },

    /**
     * Save a new image. Missing text fields default to empty.
     */
    add(row) {
      const usage = row.usage || {};
      return Number(
        stmts.insert.run({
          filename: row.filename,
          prompt: row.prompt || "",
          prompt_id: row.prompt_id ?? null,
          model: row.model || "",
          size: row.size || "",
          created_at: new Date().toISOString(),
          edited_from: row.edited_from ?? null,
          spend_counted: row.spend_counted === 1 ? 1 : 0,
          usage_total_tokens: tokenCount(usage.total),
          usage_input_tokens: tokenCount(usage.input),
          usage_output_tokens: tokenCount(usage.output),
          usage_input_text_tokens: tokenCount(usage.inputText),
          usage_input_image_tokens: tokenCount(usage.inputImage),
          usage_output_text_tokens: tokenCount(usage.outputText),
          usage_output_image_tokens: tokenCount(usage.outputImage),
        }).lastInsertRowid
      );
    },

    /**
     * Move an image to the trash.
     */
    trash(id) {
      return stmts.trash.run(new Date().toISOString(), id).changes > 0;
    },

    /**
     * Bring an image back, exactly as it was.
     */
    restore(id) {
      return stmts.restore.run(id).changes > 0;
    },

    /**
     * Destroy the row. The caller clears the join rows and unlinks the file
     */
    purge(id) {
      return stmts.remove.run(id).changes > 0;
    },

    /**
     * What is in the trash, most recently thrown away first.
     */
    trashed() {
      return stmts.trashed.all();
    },

    /**
     * One image whether or not it is in the trash.
     */
    getAnyState(id) {
      return stmts.getAnyState.get(id) ?? null;
    },

    /**
     * Detach every generation that points at a prompt, keeping the image
     * records but removing the deleted prompt_id.
     */
    clearPromptRef(promptId) {
      return stmts.clearPromptRef.run(promptId).changes > 0;
    },

    /**
     * Find the saved image a public share token points at.
     */
    getByShareToken(token) {
      return stmts.getByShareToken.get(token) ?? null;
    },

    /**
     * Attach a public share token to a saved image.
     */
    setShareToken(id, token) {
      return stmts.setShareToken.run(token, id).changes > 0;
    },

    /**
     * Drop the share token, which dead-links every copy of the shared URL.
     */
    clearShareToken(id) {
      return stmts.clearShareToken.run(id).changes > 0;
    },

    /**
     * Flip whether a saved image is a favorite, and report the value now stored.
     */
    toggleFavorite(id) {
      stmts.toggleFavorite.run(id);
      const row = stmts.getFavorite.get(id);
      return row ? row.favorite : 0;
    },

    /**
     * The previous and next starred image around this one, in the
     * favourites list's own order (created_at DESC, id DESC), or null at
     * either end.
     */
    favouriteNeighbours(id) {
      const anchor = stmts.favouriteAnchor.get(id);
      if (!anchor) return { prev: null, next: null };

      const params = { id, created_at: anchor.created_at };
      const prev = stmts.favouritePrev.get(params);
      const next = stmts.favouriteNext.get(params);
      return { prev: prev ? prev.id : null, next: next ? next.id : null };
    },

    /**
     * Give a saved image a share token, reseeding when the random value is
     * already taken. The unique index turns a collision into a retry rather
     * than a silently shared link.
     */
    share(id, makeToken, attempts) {
      return allocateToken(
        makeToken,
        (token) => stmts.setShareToken.run(token, id),
        attempts
      );
    },

    /**
     * Count the saved images that carry a public share token.
     */
    countShared() {
      return stmts.countShared.get().n;
    },

    /**
     * List one page of the shared images, newest first.
     */
    pageShared({ limit, offset }) {
      return stmts.pageShared.all({ limit, offset });
    },
  };
};
