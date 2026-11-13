/**
 * Saving a batch of uploaded images
 */

"use strict";

const fsp = require("fs/promises");

const { sniffImageType } = require("../../../utils/files/imageType");
const { generatedImageName } = require("../../../utils/domain/filename");
const { uploadPath } = require("../../../utils/files/uploads");

const STORAGE_FULL = "Storage is full.";
const NOT_AN_IMAGE = "Not a PNG, JPEG, or WebP image.";
const COULD_NOT_SAVE = "It could not be saved.";

// How many fresh names to try when one is already taken.
const NAME_TRIES = 5;

/**
 * Write bytes under a new name that is not taken yet. Returns that name.
 */
async function writeNew(ext, bytes, uploadDir, wrote) {
  for (let tried = 1; ; tried += 1) {
    const filename = generatedImageName(ext);
    const { full } = uploadPath(filename, uploadDir);
    try {
      wrote(full);
      await fsp.writeFile(full, bytes, { flag: "wx" });
      return filename;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      wrote(null);
      if (tried >= NAME_TRIES) throw err;
    }
  }
}

/**
 * Save one file
 */
async function saveOne(file, { room, uploadDir, record, details, log = console }) {
  const named = file.originalname || "that file";

  const kind = sniffImageType(file.buffer);
  if (!kind) return { name: named, error: NOT_AN_IMAGE };

  let filename = null;
  let full = null;
  let saved = false;

  try {
    saved = await room.write(file.buffer.length, async () => {
      filename = await writeNew(kind.ext, file.buffer, uploadDir, (at) => {
        full = at;
      });
    });

    if (!saved) return { name: named, error: STORAGE_FULL };

    record({ filename, ...details });
    return { name: named, ok: true };
  } catch (err) {
    log.error("Could not save upload:", err.message);
    if (full) await fsp.rm(full, { force: true }).catch(() => {});
    if (saved && room.forget) room.forget();
    return { name: named, error: COULD_NOT_SAVE };
  }
}

/**
 * Save every file, in turn, and report on each.
 */
async function saveBatch(files, options) {
  const results = [];
  for (const file of files) {
    results.push(await saveOne(file, options));
  }
  return results;
}

/**
 * What the page says about a batch, and the code it says it with.
 */
function summarise(results) {
  const saved = results.filter((result) => result.ok).length;
  const failures = results.filter((result) => !result.ok);
  const outOfRoom =
    failures.length > 0 &&
    failures.every((failure) => failure.error === STORAGE_FULL);

  let error;
  if (saved) {
    error = `Saved ${saved} of ${results.length}. The rest are listed below.`;
  } else if (outOfRoom) {
    error = `${STORAGE_FULL} Delete some saved images and try again.`;
  } else if (results.length === 1) {
    error = failures[0].error;
  } else {
    error = "None of those could be saved. Each one is listed below.";
  }

  return { saved, failures, outOfRoom, error, all: saved === results.length };
}

module.exports = {
  saveOne,
  saveBatch,
  summarise,
  STORAGE_FULL,
  NOT_AN_IMAGE,
  COULD_NOT_SAVE,
};
