export const MOOD_WORDS: readonly ["Heavy", "Low", "Steady", "Good", "Bright"];
export type MoodWord = (typeof MOOD_WORDS)[number];

export function clampMoodLevel(score: unknown): number | null;
export function moodWord(score: unknown): MoodWord | null;
export function moodScoreFromWord(word: unknown): number | null;
