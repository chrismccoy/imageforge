/**
 * Managed lists of names
 */

"use strict";

const { field } = require("../../../utils/http/request");
const { parseId } = require("../../../utils/domain/coerce");

/**
 * Build the add / rename / delete handlers for one managed list.
 */
function buildNamedListController({
  list,
  view,
  path,
  title,
  active,
  taken,
  locals = () => ({}),
}) {
  /**
   * Render the list, optionally with a message.
   */
  function renderList(res, { error = null, status = 200 } = {}) {
    return res
      .status(status)
      .render(view, Object.assign({ title, active, error }, locals()));
  }

  return {
    renderList,

    /**
     * Show the list.
     */
    index(req, res) {
      renderList(res);
    },

    /**
     * Add a row, or show why it was refused.
     */
    create(req, res) {
      const name = field(req.body, "name");
      if (!list.add(name, new Date().toISOString())) {
        return renderList(res, { error: taken, status: 400 });
      }
      res.redirect(path);
    },

    /**
     * Rename a row, or show why it was refused.
     */
    update(req, res) {
      const id = parseId(req.params.id);
      const name = field(req.body, "name");

      if (!id || !list.get(id)) return res.redirect(path);
      if (!list.rename(id, name)) {
        return renderList(res, { error: taken, status: 400 });
      }
      res.redirect(path);
    },

    /**
     * Delete a row. What pointed at it survives, pointing at nothing.
     */
    remove(req, res) {
      const id = parseId(req.params.id);
      if (id) list.remove(id);
      res.redirect(path);
    },
  };
}

module.exports = { buildNamedListController };
