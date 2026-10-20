import { SETUP_COMPLETE_KEY } from "../pages/Onboarding";
import { DRAFT_PREFIX, isDraftOf, isLegacyDraftKey } from "./draftKeys";

export type LocalEntries = [string, string][];

/**
 * Whether a localStorage key stays after a profile is deleted. `deletedId` is
 * the deleted profile; when it is unknown, every draft goes rather than risk
 * keeping its text.
 */
export function keepsAfterDelete(
  key: string,
  lastProfile: boolean,
  deletedId?: number,
): boolean {
  // The display cache holds the deleted profile's name and email.
  if (key === "userInfo") return false;
  // Unscoped drafts of older versions cannot be tied to a profile (KAN-380).
  if (isLegacyDraftKey(key)) return false;
  if (key.startsWith(DRAFT_PREFIX)) {
    if (lastProfile || deletedId === undefined) return false;
    return !isDraftOf(key, deletedId);
  }
  return !(lastProfile && key === SETUP_COMPLETE_KEY);
}

/** Everything in localStorage now, taken before the delete. */
export function snapshotLocalStorage(): LocalEntries {
  try {
    return Object.keys(localStorage).map((key) => [
      key,
      localStorage.getItem(key) ?? "",
    ]);
  } catch {
    return [];
  }
}

/**
 * Everything a deleted profile leaves behind in the browser's own storage.
 * The main process wipes localStorage as part of the delete (removing a key
 * leaves its old value in the file on disk, KAN-376); `before`, taken before
 * the delete, puts back the keys that stay: never the deleted profile's
 * drafts, and never the display cache.
 */
export function clearLocalTraces(
  lastProfile: boolean,
  deletedId?: number,
  before: LocalEntries = [],
) {
  try {
    for (const [key, value] of before) {
      if (
        keepsAfterDelete(key, lastProfile, deletedId) &&
        localStorage.getItem(key) === null
      )
        localStorage.setItem(key, value);
    }
    for (const key of Object.keys(localStorage)) {
      if (!keepsAfterDelete(key, lastProfile, deletedId))
        localStorage.removeItem(key);
    }
  } catch {
    // Storage can be unavailable; the main process has already deleted the data.
  }
}
