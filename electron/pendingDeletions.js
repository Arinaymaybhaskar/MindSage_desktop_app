import fs from "node:fs";
import path from "node:path";
import { isInside } from "./mediaPaths.js";

// Files that could not be deleted when their entry was purged or their
// profile removed (a locked file on Windows, an antivirus scan, a full disk).
// The list is a small JSON file in userData rather than a database table, so
// it survives the profile's own rows going and needs no migration. It is
// retried on every start and every purge, and only ever holds paths inside the
// media folder. KAN-344.

/** Paths still waiting to be deleted. A missing or damaged file means none. */
export function readPending(listFile) {
  try {
    const parsed = JSON.parse(fs.readFileSync(listFile, "utf8"));
    return Array.isArray(parsed)
      ? parsed.filter((p) => typeof p === "string")
      : [];
  } catch {
    return [];
  }
}

function writePending(listFile, paths) {
  try {
    if (paths.length === 0) {
      fs.rmSync(listFile, { force: true });
      return;
    }
    const tmp = `${listFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(paths));
    fs.renameSync(tmp, listFile);
  } catch (err) {
    console.error("Could not save the pending deletions:", err?.message ?? err);
  }
}

/** Adds paths to the list (duplicates ignored). */
export function addPending(listFile, mediaDir, paths) {
  const keep = paths.filter((p) => isInside(mediaDir, p));
  if (keep.length === 0) return;
  writePending(listFile, [...new Set([...readPending(listFile), ...keep])]);
}

/**
 * Tries every pending path again. A path that is gone, or that no longer lies
 * inside the media folder, leaves the list; one that still cannot be removed
 * stays. Returns how many were removed and how many remain.
 */
export function retryPending(listFile, mediaDir, remove) {
  const before = readPending(listFile);
  const still = [];
  let removed = 0;
  for (const target of before) {
    if (!isInside(mediaDir, target)) continue;
    try {
      remove(target);
      removed += 1;
    } catch {
      still.push(target);
    }
  }
  if (before.length) writePending(listFile, still);
  return { removed, remaining: still.length };
}

/** Number of paths waiting. */
export const pendingCount = (listFile) => readPending(listFile).length;

/** Default remover: a file or a folder with everything in it. */
export const removePath = (target) =>
  fs.rmSync(path.resolve(target), { recursive: true, force: true });
