// Which files the app may delete when it purges an entry. Media keys are
// absolute paths stored in the database, so deletion is confined to the app's
// own media folder: a key pointing anywhere else (a damaged row, an imported
// path) is skipped, never followed.
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
