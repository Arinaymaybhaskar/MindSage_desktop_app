import { SETUP_COMPLETE_KEY } from "../pages/Onboarding";

export type LocalEntries = [string, string][];

/** Whether a localStorage key stays after a profile is deleted. */
export function keepsAfterDelete(key: string, lastProfile: boolean): boolean {
  // The display cache holds the deleted profile's name and email.
  if (key === "userInfo") return false;
  // Draft keys are not per profile, so another profile's unsaved draft could
  // be among them; they go only when nobody else is left.
  if (lastProfile && (key.startsWith("draft-") || key === SETUP_COMPLETE_KEY))
    return false;
  return true;
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
 * the delete, puts back the keys that stay.
 */
export function clearLocalTraces(
  lastProfile: boolean,
  before: LocalEntries = [],
) {
  try {
    for (const [key, value] of before) {
      if (
        keepsAfterDelete(key, lastProfile) &&
        localStorage.getItem(key) === null
      )
        localStorage.setItem(key, value);
    }
    for (const key of Object.keys(localStorage)) {
      if (!keepsAfterDelete(key, lastProfile)) localStorage.removeItem(key);
    }
  } catch {
    // Storage can be unavailable; the main process has already deleted the data.
  }
}
