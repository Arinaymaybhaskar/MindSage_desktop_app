import { describe, it, expect } from "vitest";
// AIPrompts.js is dependency-free, so it imports cleanly in the test runner.
import {
  parseJournalMetadata,
  sanitizeMoodTags,
  clampMoodScore,
  countWords,
  isSummarizable,
  MIN_SUMMARY_WORDS,
  sanitizeSummary,
  // @ts-expect-error plain JS module without type declarations
} from "./AIPrompts.js";

describe("clampMoodScore", () => {
  it("clamps into the 1-5 range and rounds", () => {
    expect(clampMoodScore(0)).toBe(1);
    expect(clampMoodScore(9)).toBe(5);
    expect(clampMoodScore(3.4)).toBe(3);
    expect(clampMoodScore("4")).toBe(4);
  });

  it("returns null for non-numeric input", () => {
    expect(clampMoodScore("nope")).toBeNull();
    expect(clampMoodScore(undefined)).toBeNull();
  });
});

describe("sanitizeMoodTags", () => {
  it("keeps only known tags, canonicalizes case, dedupes, caps at 5", () => {
    expect(sanitizeMoodTags(["playful", "PLAYFUL", "Lonely"])).toEqual([
      "Playful",
      "Lonely",
    ]);
    expect(sanitizeMoodTags(["Happy", "NotARealTag", 42])).toEqual([]);
    expect(
      sanitizeMoodTags([
        "Proud",
        "Content",
        "Peaceful",
        "Optimistic",
        "Trusting",
        "Playful",
      ]),
    ).toHaveLength(5);
  });

  it("returns [] for non-arrays", () => {
    expect(sanitizeMoodTags("Playful")).toEqual([]);
  });
});

describe("parseJournalMetadata", () => {
  it("parses a clean JSON string and sanitizes fields", () => {
    const raw =
      '{"title":"A good day","mood_score":4,"mood_tags":["proud","bogus"]}';
    expect(parseJournalMetadata(raw)).toEqual({
      title: "A good day",
      mood_score: 4,
      mood_tags: ["Proud"],
    });
  });

  it("tolerates prose/markdown around the JSON", () => {
    const raw =
      'Sure! Here is the JSON:\n```json\n{"title":"Reflecting","mood_score":3,"mood_tags":[]}\n```';
    expect(parseJournalMetadata(raw)).toMatchObject({
      title: "Reflecting",
      mood_score: 3,
    });
  });

  it("returns null when unusable (no title or bad score) instead of garbage", () => {
    expect(parseJournalMetadata('{"mood_score":4}')).toBeNull();
    expect(parseJournalMetadata('{"title":"x","mood_score":"NaN"}')).toBeNull();
    expect(parseJournalMetadata("not json at all")).toBeNull();
    expect(parseJournalMetadata("")).toBeNull();
  });
});

describe("countWords / isSummarizable", () => {
  it("counts whitespace-delimited words, ignoring extra spaces", () => {
    expect(countWords("  one   two\nthree ")).toBe(3);
    expect(countWords("")).toBe(0);
    expect(countWords(null)).toBe(0);
  });

  it("summarizes only entries at or above the word minimum", () => {
    const longEnough = Array.from(
      { length: MIN_SUMMARY_WORDS },
      (_, i) => `word${i}`,
    ).join(" ");
    expect(isSummarizable(longEnough)).toBe(true);
    expect(isSummarizable("just a couple words")).toBe(false);
    expect(isSummarizable("")).toBe(false);
  });
});

describe("sanitizeSummary", () => {
  it("accepts a genuine summary and strips a benign preamble", () => {
    const good =
      "The writer reflects on a stressful week at work and finds relief after a weekend hike, feeling more hopeful about the days ahead.";
    expect(sanitizeSummary(good)).toBe(good);
    expect(sanitizeSummary(`Here is a summary:\n${good}`)).toBe(good);
  });

  it("rejects the model's meta-commentary / refusal responses", () => {
    const refusal =
      "It appears that you have provided a large block of text that contains no relevant information or context. The text seems to be a repetition of a sentence, which doesn't provide any useful information.\n\nCould you please provide more context or clarify what you would like to achieve with this conversation? I'll do my best to assist you and provide a helpful response.";
    expect(sanitizeSummary(refusal)).toBeNull();
  });

  it("rejects the UNSUMMARIZABLE sentinel, empty, and too-short output", () => {
    expect(sanitizeSummary("UNSUMMARIZABLE")).toBeNull();
    expect(sanitizeSummary("  unsummarizable.  ")).toBeNull();
    expect(sanitizeSummary("")).toBeNull();
    expect(sanitizeSummary("Short.")).toBeNull();
    expect(sanitizeSummary(null)).toBeNull();
  });
});
