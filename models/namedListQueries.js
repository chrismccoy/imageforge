/**
 * Named lists
 */

"use strict";

/**
 * Whether a database error is the unique index refusing a duplicate name.
 */
function isDuplicate(err) {
  return err && err.code === "SQLITE_CONSTRAINT_UNIQUE";
}

/**
 * The add / rename / remove trio over a table's statements.
 */
function buildNamedList(db, { insert, rename, remove, detach }) {
  const removeWithDetach = db.transaction((id) => {
    detach.run(id);
    return remove.run(id).changes > 0;
  });

  return {
    /**
     * Add a row. Returns its id, or null when blank or already taken.
     */
    add(name, nowIso) {
      const clean = String(name || "").trim();
      if (!clean) return null;

      try {
        return Number(insert.run(clean, nowIso).lastInsertRowid);
      } catch (err) {
        if (isDuplicate(err)) return null;
        throw err;
      }
    },

    /**
     * Rename a row. Reports whether it took.
     */
    rename(id, name) {
      const clean = String(name || "").trim();
      if (!clean) return false;

      try {
        rename.run(clean, id);
        return true;
      } catch (err) {
        if (isDuplicate(err)) return false;
        throw err;
      }
    },

    /**
     * Delete a row, detaching whatever pointed at it. Reports whether it took.
     */
    remove(id) {
      return removeWithDetach(id);
    },
  };
}

module.exports = { buildNamedList };
