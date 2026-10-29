import { describe, it, expect } from "vitest";
// AIPrompts.js is dependency-free, so it imports cleanly in the test runner.
import {
  parseJournalMetadata,
  sanitizeMoodTags,
  JOURNAL_METADATA_SCHEMA,
  getAutoPopulateValues,
  countWords,
  isSummarizable,
  MIN_SUMMARY_WORDS,
  sanitizeSummary,
  // @ts-expect-error plain JS module without type declarations
} from "./AIPrompts.js";

describe("mood word schema (KAN-93)", () => {
  it("asks for one of the five words through an enum", () => {
    expect(JOURNAL_METADATA_SCHEMA.properties.mood).toEqual({
      enum: ["Heavy", "Low", "Steady", "Good", "Bright"],
    });
    expect(JOURNAL_METADATA_SCHEMA.required).toContain("mood");
  });

  it("gives no example mood value in the prompt", () => {
    const prompt = getAutoPopulateValues("entry text");
    expect(prompt).not.toMatch(/"mood(_score)?":/);
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
  it("cuts a runaway title before it reaches the journal", () => {
    const raw = JSON.stringify({ title: "word ".repeat(100), mood: "Steady" });
    const { title } = parseJournalMetadata(raw)!;
    expect(title.length).toBeLessThanOrEqual(80);
    expect(title).toMatch(/^word/);
  });

  it("parses a clean JSON string and sanitizes fields", () => {
    const raw =
      '{"title":"A good day","mood":"Good","mood_tags":["proud","bogus"]}';
    expect(parseJournalMetadata(raw)).toEqual({
      title: "A good day",
      mood_score: 4,
      mood_tags: ["Proud"],
    });
  });

  it("tolerates prose/markdown around the JSON", () => {
    const raw =
      'Sure! Here is the JSON:\n```json\n{"title":"Reflecting","mood":"steady","mood_tags":[]}\n```';
    expect(parseJournalMetadata(raw)).toMatchObject({
      title: "Reflecting",
      mood_score: 3,
    });
  });

  it("returns null when unusable (no title or bad mood) instead of garbage", () => {
    expect(parseJournalMetadata('{"mood":"Good"}')).toBeNull();
    // Nothing outside the five words is stored, numbers included.
    expect(parseJournalMetadata('{"title":"x","mood":"Great"}')).toBeNull();
    expect(parseJournalMetadata('{"title":"x","mood_score":4}')).toBeNull();
    expect(parseJournalMetadata('{"title":"x","mood":4}')).toBeNull();
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

describe("Ask prompts carry the no-advice rule", () => {
  it("both prompts include it", async () => {
    // @ts-expect-error plain JS module without type declarations
    const m = await import("./AIPrompts.js");
    expect(m.NO_ADVICE_RULE).toMatch(/not a therapist/i);
    expect(m.respondWithContext("q", [])).toContain(m.NO_ADVICE_RULE);
    expect(m.respondWithoutContext("q")).toContain(m.NO_ADVICE_RULE);
  });
});
