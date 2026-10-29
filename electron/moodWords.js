// The five mood words (KAN-93), shared by the renderer, the export and the AI
// prompts. mood_score stays an integer 1 to 5 in the database; this is its
// word. Import-free so the renderer and plain Node scripts can load it.

/** Index is score - 1. */
export const MOOD_WORDS = ["Heavy", "Low", "Steady", "Good", "Bright"];

/** Clamps a score (or an average) to an integer 1 to 5, or null for none. */
export function clampMoodLevel(score) {
  if (score === null || score === undefined || score === "") return null;
  const n = Math.round(Number(score));
  if (!Number.isFinite(n)) return null;
  return Math.min(5, Math.max(1, n));
}

/** The word for a score; null when there is no mood. Out of range clamps. */
export function moodWord(score) {
  const level = clampMoodLevel(score);
  return level === null ? null : MOOD_WORDS[level - 1];
}

/** The score for one of the five words (any case), or null. */
export function moodScoreFromWord(word) {
  if (typeof word !== "string") return null;
  const i = MOOD_WORDS.findIndex(
    (w) => w.toLowerCase() === word.trim().toLowerCase(),
  );
  return i === -1 ? null : i + 1;
}
