/**
 * Sidebar navigation
 */

"use strict";

const { PAGES } = require("./urls");

const NAV_GROUPS = [
  { key: "main", title: "Main" },
  { key: "library", title: "Library" },
  { key: "public", title: "Public" },
  { key: "system", title: "System" },
];

const NAV_LINKS = [
  {
    href: PAGES.dashboard,
    label: "Dashboard",
    key: "dashboard",
    group: "main",
    icon: "fa-solid fa-gauge-high",
  },
  {
    href: PAGES.generate,
    label: "Generate",
    key: "generate",
    group: "main",
    icon: "fa-solid fa-wand-magic-sparkles",
  },
  {
    href: PAGES.upload,
    label: "Upload",
    key: "upload",
    group: "main",
    icon: "fa-solid fa-arrow-up-from-bracket",
  },

  {
    href: PAGES.generations,
    label: "Generations",
    key: "generations",
    group: "library",
    icon: "fa-regular fa-images",
    count: "generations",
  },
  {
    href: PAGES.prompts,
    label: "Prompts",
    key: "prompts",
    group: "library",
    icon: "fa-regular fa-pen-to-square",
    count: "prompts",
  },
  {
    href: PAGES.categories,
    label: "Categories",
    key: "categories",
    group: "library",
    icon: "fa-solid fa-tags",
    count: "categories",
  },
  {
    href: PAGES.collections,
    label: "Collections",
    key: "collections",
    group: "library",
    icon: "fa-regular fa-folder-open",
    count: "collections",
  },
  {
    href: `${PAGES.generations}?fav=1`,
    label: "Favourites",
    key: "favourites",
    group: "library",
    icon: "fa-solid fa-star",
    count: "favourites",
  },
  {
    href: `${PAGES.prompts}?sort=rating`,
    label: "Top rated",
    key: "toprated",
    group: "library",
    icon: "fa-solid fa-ranking-star",
  },

  {
    href: PAGES.gallery,
    label: "Gallery",
    key: "gallery",
    group: "public",
    icon: "fa-solid fa-globe",
    newTab: true,
    count: "gallery",
  },

  {
    href: PAGES.settings,
    label: "Settings",
    key: "settings",
    group: "system",
    icon: "fa-solid fa-gear",
  },
  {
    href: PAGES.promptsBackup,
    label: "Backup",
    key: "backup",
    group: "system",
    icon: "fa-solid fa-floppy-disk",
  },
  {
    href: PAGES.trash,
    label: "Trash",
    key: "trash",
    group: "system",
    icon: "fa-regular fa-trash-can",
    count: "trash",
  },
];

module.exports = { NAV_LINKS, NAV_GROUPS };
