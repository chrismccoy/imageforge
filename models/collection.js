/**
 * Collections
 */

"use strict";

const { statementCache } = require("./criteria");
const { buildNamedList } = require("./namedListQueries");
const { allocateToken } = require("./allocateToken");
const { toTrimmedString } = require("../utils/domain/coerce");

/**
 * Build the collection model against a database connection.
 */
module.exports = (db) => {
  const stmts = {
    all: db.prepare(
      `SELECT c.id, c.name, c.created_at, c.share_token, c.public_title,
         (SELECT COUNT(*) FROM generation_collections gc
          JOIN live_generations g ON g.id = gc.generation_id
          WHERE gc.collection_id = c.id) AS images
       FROM collections c
       ORDER BY c.name COLLATE NOCASE ASC`
    ),
    get: db.prepare(
      `SELECT id, name, created_at, share_token, public_title
       FROM collections WHERE id = ?`
    ),
    byToken: db.prepare(
      "SELECT id, name, public_title, share_token FROM collections WHERE share_token = ?"
    ),
    setToken: db.prepare(
      "UPDATE collections SET share_token = ?, public_title = ? WHERE id = ?"
    ),
    clearToken: db.prepare(
      "UPDATE collections SET share_token = NULL WHERE id = ?"
    ),
    insert: db.prepare("INSERT INTO collections (name, created_at) VALUES (?, ?)"),
    rename: db.prepare("UPDATE collections SET name = ? WHERE id = ?"),
    remove: db.prepare("DELETE FROM collections WHERE id = ?"),

    detach: db.prepare(
      "DELETE FROM generation_collections WHERE collection_id = ?"
    ),
    clearImage: db.prepare(
      "DELETE FROM generation_collections WHERE generation_id = ?"
    ),
    addImage: db.prepare(
      `INSERT OR IGNORE INTO generation_collections (generation_id, collection_id)
       VALUES (?, ?)`
    ),
    removeImage: db.prepare(
      `DELETE FROM generation_collections
       WHERE generation_id = ? AND collection_id = ?`
    ),
    ofImage: db.prepare(
      `SELECT c.id, c.name FROM generation_collections gc
       JOIN collections c ON c.id = gc.collection_id
       JOIN live_generations g ON g.id = gc.generation_id
       WHERE gc.generation_id = ?
       ORDER BY c.name COLLATE NOCASE ASC`
    ),
    holds: db.prepare(
      `SELECT 1 FROM generation_collections gc
       JOIN live_generations g ON g.id = gc.generation_id
       WHERE gc.collection_id = ? AND gc.generation_id = ?`
    ),
    allImagesIn: db.prepare(
      `SELECT g.id, g.filename, g.prompt, g.model, g.size, g.created_at,
              g.usage_total_tokens
       FROM generation_collections gc
       JOIN live_generations g ON g.id = gc.generation_id
       WHERE gc.collection_id = ?
       ORDER BY g.created_at DESC, g.id DESC`
    ),
    imagesPage: db.prepare(
      `SELECT g.id, g.filename, g.prompt, g.model, g.size, g.created_at,
              g.usage_total_tokens
       FROM generation_collections gc
       JOIN live_generations g ON g.id = gc.generation_id
       WHERE gc.collection_id = @id
       ORDER BY g.created_at DESC, g.id DESC
       LIMIT @limit OFFSET @offset`
    ),
    countImages: db.prepare(
      `SELECT COUNT(*) AS n FROM generation_collections gc
       JOIN live_generations g ON g.id = gc.generation_id
       WHERE gc.collection_id = ?`
    ),
    neighbourAnchor: db.prepare(
      `SELECT g.created_at FROM generation_collections gc
       JOIN live_generations g ON g.id = gc.generation_id
       WHERE gc.collection_id = ? AND gc.generation_id = ?`
    ),
    neighbourPrev: db.prepare(
      `SELECT g.id FROM generation_collections gc
       JOIN live_generations g ON g.id = gc.generation_id
       WHERE gc.collection_id = @collectionId
         AND (g.created_at, g.id) > (@created_at, @id)
       ORDER BY g.created_at ASC, g.id ASC LIMIT 1`
    ),
    neighbourNext: db.prepare(
      `SELECT g.id FROM generation_collections gc
       JOIN live_generations g ON g.id = gc.generation_id
       WHERE gc.collection_id = @collectionId
         AND (g.created_at, g.id) < (@created_at, @id)
       ORDER BY g.created_at DESC, g.id DESC LIMIT 1`
    ),
  };

  const list = buildNamedList(db, stmts);

  const addMany = db.transaction((ids, collectionId) => {
    let added = 0;
    for (const id of ids) {
      added += stmts.addImage.run(id, collectionId).changes;
    }
    return added;
  });

  const stmt = statementCache(db);

  return {
    /**
     * Every collection in name order, with how many images each holds.
     */
    all() {
      return stmts.all.all();
    },

    /**
     * One collection by id.
     */
    get(id) {
      return stmts.get.get(id) ?? null;
    },

    /**
     * Add a collection. Returns its id, or null when blank or already taken.
     */
    add: list.add,

    /**
     * Rename a collection. Reports whether it took.
     */
    rename: list.rename,

    /**
     * Delete a collection, reporting whether it took. Its images survive,
     * filed nowhere.
     */
    remove: list.remove,

    /**
     * File an image under a collection. Doing it twice changes nothing.
     */
    addImage(generationId, collectionId) {
      return stmts.addImage.run(generationId, collectionId).changes > 0;
    },

    /**
     * Take an image back out. Removing what is not there is not an error.
     */
    removeImage(generationId, collectionId) {
      return stmts.removeImage.run(generationId, collectionId).changes > 0;
    },

    /**
     * File a whole selection at once, reporting how many were not already in.
     */
    addImages(ids, collectionId) {
      if (!ids.length) return 0;
      return addMany(ids, collectionId);
    },

    /**
     * Every collection one image is in, in name order.
     */
    ofImage(generationId) {
      return stmts.ofImage.all(generationId);
    },

    /**
     * Take an image out of every collection, for when it is deleted.
     */
    clearImage(generationId) {
      return stmts.clearImage.run(generationId).changes > 0;
    },

    /**
     * Share a collection, returning its new token, or null with no title.
     */
    share(id, title, makeToken, attempts) {
      const clean = toTrimmedString(title);
      if (!clean) return null;

      return allocateToken(
        makeToken,
        (token) => stmts.setToken.run(token, clean, id),
        attempts
      );
    },

    /**
     * Revoke the link. The title is kept so re-sharing does not ask again.
     */
    unshare(id) {
      return stmts.clearToken.run(id).changes > 0;
    },

    /**
     * The collection a live token points at, or null.
     */
    byToken(token) {
      const clean = toTrimmedString(token);
      return (clean ? stmts.byToken.get(clean) : null) ?? null;
    },

    /**
     * Whether this image is in this collection.
     */
    holds(collectionId, generationId) {
      return Boolean(stmts.holds.get(collectionId, generationId));
    },

    /**
     * Every image in a collection, newest first.
     */
    allImagesIn(collectionId) {
      return stmts.allImagesIn.all(collectionId);
    },

    /**
     * One page of a collection's images, for the public grid.
     */
    imagesPage(collectionId, { limit, offset }) {
      return stmts.imagesPage.all({ id: collectionId, limit, offset });
    },

    /**
     * How many images are in a collection, which drives the pager.
     */
    countImages(collectionId) {
      return stmts.countImages.get(collectionId).n;
    },

    /**
     * The previous and next image around this one, in this collection's own
     * order (created_at DESC, id DESC), or null at either end.
     */
    neighboursIn(collectionId, id) {
      const anchor = stmts.neighbourAnchor.get(collectionId, id);
      if (!anchor) return { prev: null, next: null };

      const params = { collectionId, id, created_at: anchor.created_at };
      const prev = stmts.neighbourPrev.get(params);
      const next = stmts.neighbourNext.get(params);
      return { prev: prev ? prev.id : null, next: next ? next.id : null };
    },

    /**
     * The collections for a whole page of images, keyed by image id.
     */
    forImages(ids) {
      if (!ids.length) return {};

      const holes = ids.map(() => "?").join(", ");
      const rows = stmt(
        `SELECT gc.generation_id AS gid, c.id, c.name
         FROM generation_collections gc
         JOIN collections c ON c.id = gc.collection_id
         JOIN live_generations g2 ON g2.id = gc.generation_id
         WHERE gc.generation_id IN (${holes})
         ORDER BY c.name COLLATE NOCASE ASC`
      ).all(ids);

      const map = {};
      for (const row of rows) {
        if (!map[row.gid]) map[row.gid] = [];
        map[row.gid].push({ id: row.id, name: row.name });
      }
      return map;
    },
  };
};
