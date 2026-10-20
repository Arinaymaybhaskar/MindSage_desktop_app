/**
 * Unsaved drafts live in localStorage, which every profile on this computer
 * shares, so each key names the profile it belongs to: `draft:<userId>:<name>`.
 * Another profile never reads it, and deleting a profile drops exactly its own
 * (KAN-380).
 */
export const DRAFT_PREFIX = "draft:";

export const draftKey = (userId: number, name: string) =>
  `${DRAFT_PREFIX}${userId}:${name}`;

export const isDraftOf = (key: string, userId: number) =>
  key.startsWith(`${DRAFT_PREFIX}${userId}:`);

/**
 * Older versions kept drafts under unscoped keys (`draft-journal`,
 * `draft-journal-<id>`, `draft-quick-capture`) that cannot be tied to a
 * profile. They are dropped, never offered to whoever signs in next.
 */
export const isLegacyDraftKey = (key: string) => key.startsWith("draft-");

export function dropLegacyDrafts() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (isLegacyDraftKey(key)) localStorage.removeItem(key);
    }
  } catch {
    // Storage can be unavailable; there is then nothing to leak.
  }
}
