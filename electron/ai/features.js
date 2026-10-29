// Per-profile switches for each background AI feature (KAN-70, KAN-437):
//   enrich      title, summary and the mood word (KAN-93) after saving
//   feelings    feeling words (KAN-94, the user's own included) offered as
//               suggestions; none is saved until the user ticks it
//   suggestions autocomplete while writing (ghost text)
// All on by default; turning one off stops future calls of that type only.
// Existing titles, moods, summaries and ticked feelings stay, and turning
// enrich back on does not backfill old entries. A job already running when
// its switch goes off finishes and is saved; one still waiting in the queue
// re-checks the switch when its turn comes and does nothing if it is off.
// Kept in electron-store, like People's switches, so no schema change.
import Store from "electron-store";

export const AI_FEATURES = ["enrich", "feelings", "suggestions"];

let store; // lazy: importing this file must not open the store
const getStore = () =>
  (store ??= new Store({ name: "ai-features", defaults: { users: {} } }));

/** { enrich, feelings, suggestions } booleans for one profile. */
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

/** What the title/mood/feelings call asks for under these switches. */
export const metadataParts = (f) => ({
  enrich: f.enrich,
  feelings: f.feelings,
});

/** True when the title/mood/feelings call has anything to ask for. */
export const metadataOn = (f) => f.enrich || f.feelings;
