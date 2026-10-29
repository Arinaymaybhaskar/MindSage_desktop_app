import { describe, it, expect } from "vitest";
import { MOOD_WORDS, moodWord, moodScoreFromWord } from "./moodWords.js";

describe("mood words (KAN-93)", () => {
  it("maps 1 to 5 onto the five words, one to one", () => {
    expect([1, 2, 3, 4, 5].map(moodWord)).toEqual(MOOD_WORDS);
    expect(MOOD_WORDS).toEqual(["Heavy", "Low", "Steady", "Good", "Bright"]);
    expect(MOOD_WORDS.map(moodScoreFromWord)).toEqual([1, 2, 3, 4, 5]);
  });

  it("shows no word for no mood, never Steady", () => {
    expect(moodWord(null)).toBeNull();
    expect(moodWord(undefined)).toBeNull();
    expect(moodWord("")).toBeNull();
    expect(moodWord("nope")).toBeNull();
  });

  it("clamps out-of-range scores and rounds averages", () => {
    expect(moodWord(0)).toBe("Heavy");
    expect(moodWord(6)).toBe("Bright");
    expect(moodWord(3.4)).toBe("Steady");
    expect(moodWord(3.6)).toBe("Good");
  });

  it("reads a word in any case, and nothing else", () => {
    expect(moodScoreFromWord(" bright ")).toBe(5);
    expect(moodScoreFromWord("Great")).toBeNull();
    expect(moodScoreFromWord(4)).toBeNull();
  });
});
