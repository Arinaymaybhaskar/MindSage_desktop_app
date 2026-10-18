// Which files the app may delete when it purges an entry. Media keys are
// absolute paths stored in the database, so deletion is confined to the app's
// own media folder: a key pointing anywhere else (a damaged row, an imported
// path) is skipped, never followed.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** True when `file` is `base` or lies inside it. */
export function isInside(base, file) {
  if (!base || !file || typeof file !== "string") return false;
  const rel = path.relative(path.resolve(base), path.resolve(file));
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * Splits media keys into the files that may be deleted and those refused.
 * @param {string} mediaDir
 * @param {Array<string | null | undefined>} keys
 */
export function planFileRemoval(mediaDir, keys) {
  const remove = [];
  const refused = [];
  for (const key of new Set((keys ?? []).filter(Boolean))) {
    (isInside(mediaDir, key) ? remove : refused).push(key);
  }
  return { remove, refused };
}

/** Where everything saved for one entry lives: media/journals/<id>/. */
export function journalMediaDir(mediaDir, journalId) {
  return path.join(mediaDir, "journals", String(Number(journalId)));
}

const sha1 = (text) => crypto.createHash("sha1").update(text).digest("hex");

/**
 * A thumbnail's file name starts with a hash of the photo's path alone, then
 * the width and the file's size and mtime. Every size ever made of one photo
 * therefore shares a prefix, so they can all be found (and removed) from the
 * path, without knowing which widths were asked for or whether the photo
 * still exists.
 */
export function thumbnailName(imagePath, width, mtimeMs, size) {
  return `${sha1(imagePath)}-${sha1(`${width}|${mtimeMs}|${size}`)}.jpg`;
}

/** Deletes every cached thumbnail of this photo; returns how many. */
export function removeThumbnails(thumbDir, imagePath) {
  let removed = 0;
  let names;
  try {
    names = fs.readdirSync(thumbDir);
  } catch {
    return 0;
  }
  const prefix = `${sha1(imagePath)}-`;
  for (const name of names) {
    if (!name.startsWith(prefix)) continue;
    try {
      fs.rmSync(path.join(thumbDir, name), { force: true });
      removed += 1;
    } catch {
      // Left behind; harmless and retried never, so say nothing.
    }
  }
  return removed;
}
