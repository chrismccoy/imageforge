/**
 * Prompts controller
 */

"use strict";

const { PAGES } = require("../config/urls");
const { field, idRows } = require("../utils/http/request");
const { parseId } = require("../utils/domain/coerce");
const { readPaging } = require("../utils/http/pageRequest");
const { confirmed, renderConfirm } = require("../utils/http/confirm");
const { problem } = require("../utils/http/http");
const { likePattern } = require("../utils/domain/search");
const { sortKeyFor } = require("../utils/domain/promptSort");
const { requireDeps } = require("./support/helpers/requireDeps");
const { renderPromptForm, fieldsFrom } = require("./support/helpers/promptForm");
const { promptLinks } = require("./support/helpers/promptLinks");

const BOTH_REQUIRED = "Both a name and prompt text are required.";

const MADE_FROM_PREVIEW = 4;

/**
 * Build the prompts controller
 */
module.exports = (deps) => {
  const { models } = requireDeps(deps, ["models"], "promptsController");
  const { Prompt, Category, Generation, ops } = models;

  /**
   * Render the prompts list, with anything the caller wants said on it.
   */
  function renderList(req, res, overrides = {}) {
    const q = field(req.query, "q");
    const search = likePattern(q);
    const category = field(req.query, "category");
    const sort = field(req.query, "sort");

    const total = Prompt.count({ search, categoryId: category });
    const { page, totalPages, offset, pageSize } = readPaging(
      req,
      req.settings,
      total
    );

    const target = overrides.status ? res.status(overrides.status) : res;

    return target.render(
      "prompts",
      Object.assign(
        {
          title: "Saved Prompts",
          active: sort === "rating" ? "toprated" : "prompts",
          prompts: Prompt.page({
            search,
            categoryId: category,
            sort,
            limit: pageSize,
            offset,
          }).map((row) =>
            Object.assign({}, row, { sortKey: sortKeyFor(row, sort) })
          ),
          categories: Category.all(),
          q,
          category,
          total,
          totalAll: search || category ? Prompt.count() : total,
          page,
          totalPages,
          pageSize,
          sort,
          ...promptLinks({ q, category, sort }, page),
        },
        overrides
      )
    );
  }

  return {
    /**
     * Show one page of the saved prompts, in name order.
     */
    index(req, res) {
      renderList(req, res);
    },

    /**
     * Delete several prompts at once, asking first.
     */
    bulkDelete(req, res) {
      const rows = idRows(req.body, "ids", (id) => Prompt.get(id));

      if (!rows.length) return res.redirect(PAGES.prompts);

      if (!confirmed(req)) {
        return renderConfirm(res, {
          title: "Delete prompts",
          active: "prompts",
          heading: `Delete ${rows.length} prompts?`,
          detail:
            "This cannot be undone. Images made from them are kept, and become unattached.",
          action: `${PAGES.prompts}/bulk-delete`,
          backUrl: PAGES.prompts,
          rows,
          label: (row) => row.name,
        });
      }

      ops.deletePrompts(rows.map((row) => row.id));
      res.redirect(PAGES.prompts);
    },

    /**
     * Set or clear a prompt's rating.
     */
    rate(req, res) {
      const id = parseId(req.params.id);
      if (!id || !Prompt.get(id)) {
        return problem(res, 404, "That prompt is not saved.");
      }

      res.json({ rating: Prompt.setRating(id, Number(req.params.value)) });
    },

    /**
     * Pin a prompt to the top of the list, or take the pin off.
     */
    pin(req, res) {
      const id = parseId(req.params.id);
      if (!id || !Prompt.get(id)) {
        return problem(res, 404, "That prompt is not saved.");
      }

      res.json({
        pinned: Prompt.setPinned(id, Boolean(field(req.body, "pinned"))),
      });
    },

    /**
     * Show the add form filled in from an existing prompt.
     */
    duplicateForm(req, res) {
      const id = parseId(req.params.id);
      const source = id ? Prompt.get(id) : null;
      if (!source) {
        return res.redirect(PAGES.prompts);
      }

      renderPromptForm(res, {
        categories: Category.all(),
        mode: "new",
        action: PAGES.prompts,
        prompt: {
          name: `Copy of ${source.name}`,
          prompt: source.prompt,
          category_id: source.category_id,
          default_size: source.default_size,
          default_model: source.default_model,
          notes: source.notes,
        },
      });
    },

    /**
     * Show the empty add prompt form.
     */
    newForm(req, res) {
      renderPromptForm(res, {
        categories: Category.all(),
        mode: "new",
        action: PAGES.prompts,
        prompt: { name: "", prompt: "" },
      });
    },

    /**
     * Save a new prompt, or show the form again with an error when a field is empty.
     */
    create(req, res) {
      const name = field(req.body, "name");
      const prompt = field(req.body, "prompt");
      const fields = fieldsFrom(req.body);

      if (!name || !prompt) {
        return renderPromptForm(res, {
          categories: Category.all(),
          mode: "new",
          action: PAGES.prompts,
          prompt: {
            name,
            prompt,
            category_id: field(req.body, "category_id"),
            default_size: fields.size,
            default_model: fields.model,
            notes: fields.notes,
          },
          error: BOTH_REQUIRED,
          status: 400,
        });
      }

      Prompt.add(name, prompt, field(req.body, "category_id"), fields);
      res.redirect(PAGES.prompts);
    },

    /**
     * Show the edit form filled in with an existing prompt.
     */
    editForm(req, res) {
      const id = parseId(req.params.id);
      const prompt = id ? Prompt.get(id) : null;
      if (!prompt) {
        return res.redirect(PAGES.prompts);
      }

      const madeFrom = Generation.page({
        promptId: prompt.id,
        limit: MADE_FROM_PREVIEW,
        offset: 0,
      });
      const madeFromTotal = Generation.count({ promptId: prompt.id });

      renderPromptForm(res, {
        categories: Category.all(),
        mode: "edit",
        action: `${PAGES.prompts}/${id}`,
        prompt,
        madeFrom,
        madeFromTotal,
      });
    },

    /**
     * Save changes to a prompt, or show the form again with an error when a field is empty.
     */
    update(req, res) {
      const id = parseId(req.params.id);
      const existing = id ? Prompt.get(id) : null;
      if (!existing) {
        return res.redirect(PAGES.prompts);
      }

      const name = field(req.body, "name");
      const prompt = field(req.body, "prompt");
      const fields = fieldsFrom(req.body);

      if (!name || !prompt) {
        return renderPromptForm(res, {
          categories: Category.all(),
          mode: "edit",
          action: `${PAGES.prompts}/${id}`,
          madeFrom: Generation.page({
            promptId: id,
            limit: MADE_FROM_PREVIEW,
            offset: 0,
          }),
          madeFromTotal: Generation.count({ promptId: id }),
          prompt: {
            id,
            name,
            prompt,
            category_id: field(req.body, "category_id"),
            default_size: fields.size,
            default_model: fields.model,
            notes: fields.notes,
            rating: existing.rating,
            pinned: existing.pinned,
          },
          error: BOTH_REQUIRED,
          status: 400,
        });
      }

      Prompt.update(id, name, prompt, field(req.body, "category_id"), fields);
      res.redirect(PAGES.prompts);
    },

    /**
     * Delete a prompt by id, then return to the list.
     */
    remove(req, res) {
      const id = parseId(req.params.id);
      if (id) {
        ops.deletePrompt(id);
      }
      res.redirect(PAGES.prompts);
    },
  };
};
