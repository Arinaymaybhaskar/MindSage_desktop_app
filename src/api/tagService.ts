// Feeling words in the user's own words (KAN-94). The main process scopes
// everything to the signed-in user.
import type { MoodCore } from "../utils/moodHierarchy";

export interface CustomFeelingWord {
  name: string;
  family: MoodCore;
  /** Entries (not in the Trash) that use it; only on the list. */
  uses?: number;
}

const invoke = <T>(channel: string, ...args: unknown[]) =>
  window.electron.ipcRenderer.invoke<T>(channel, ...args);

export const tagService = {
  /** The user's own words, most used first. */
  listCustomWords: () => invoke<CustomFeelingWord[]>("tags:custom-list"),
  /**
   * Keeps a word with its family and returns the word to use: a built-in or
   * existing word that differs only by case or accents comes back instead.
   */
  addCustomWord: (name: string, family: MoodCore) =>
    invoke<CustomFeelingWord | { error: string }>("tags:custom-add", {
      name,
      family,
    }),
};
