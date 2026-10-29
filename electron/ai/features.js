// Per-profile switches for each background AI feature (KAN-70). All on by
// default; turning one off stops future calls of that type only. Existing
// titles, moods and summaries stay, and turning summary back on does not
// backfill old entries. A job already running when its switch goes off
// finishes and is saved; one still waiting in the queue re-checks the switch
// when its turn comes and does nothing if it is off.
// Kept in electron-store, like People's switches, so no schema change.
import Store from "electron-store";

export const AI_FEATURES = [
  "title",
  "summary",
  "mood",
  "feelings",
  "suggestions",
];

let store; // lazy: importing this file must not open the store
const getStore = () =>
  (store ??= new Store({ name: "ai-features", defaults: { users: {} } }));

/** { title, summary, mood, feelings, suggestions } booleans for one profile. */
export function getFeatures(userId) {
  const saved = getStore().get(`users.${userId}`) ?? {};
  return Object.fromEntries(
    AI_FEATURES.map((key) => [key, saved[key] !== false]),
  );
}

export function setFeature(userId, key, enabled) {
  if (!AI_FEATURES.includes(key)) throw new Error("Unknown AI feature");
  getStore().set(`users.${userId}`, {
    ...getFeatures(userId),
    [key]: enabled === true,
  });
  return getFeatures(userId);
}

/** Drops the fields of switched-off features, keeping what the entry has. */
export function maskMetadata(metadata, entry, features) {
  const masked = { ...metadata };
  if (!features.title) masked.title = entry.title ?? "";
  if (!features.mood) masked.mood_score = entry.mood_score;
  if (!features.feelings) masked.mood_tags = entry.mood_tags ?? [];
  return masked;
}

/** True when the title/mood/feelings call has anything left to fill in. */
export const metadataOn = (f) => f.title || f.mood || f.feelings;
