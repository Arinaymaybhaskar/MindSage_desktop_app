import localDB from "../db/index.js";
import { requireUserId } from "../session.js";
import {
  FEELING_FAMILIES,
  builtInFeeling,
  cleanFeelingWord,
  feelingKey,
} from "./AIPrompts.js";

/** tags:custom-list: the user's own feeling words, most used first. */
export const handleListCustomWords = () =>
  localDB.customFeelingWords(requireUserId());

/**
 * tags:custom-add: keeps a feeling word in the user's own words with the
 * family they picked, and returns the word to use. A built-in word, or one
 * they already have, differing only by case or accents is returned instead of
 * a copy. Adding a word changes no entry, so the search index is not touched.
 */
export function handleAddCustomWord(_event, { name, family } = {}) {
  const userId = requireUserId();
  const word = cleanFeelingWord(name);
  if (!word)
    return {
      error: "Write a word of up to 40 characters, without a comma, ; or |.",
    };
  const builtIn = builtInFeeling(word);
  if (builtIn) return builtIn;
  if (!FEELING_FAMILIES.includes(family))
    return { error: "Pick the family this word belongs to." };
  const key = feelingKey(word);
  const same = localDB.tagNames(userId).find((t) => feelingKey(t.name) === key);
  return localDB.saveCustomFeelingWord(userId, same?.name ?? word, family);
}
