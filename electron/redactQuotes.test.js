import { describe, expect, it } from "vitest";
import { redactQuotes, REMOVED_MARKER as M, RUN } from "./redactQuotes.js";

const entry = {
  title: "A slow morning by the river",
  content:
    "I walked by the river this morning and felt calm and grateful. The marmalade on the toast was the best part of a quiet breakfast.",
};

describe("redactQuotes", () => {
  it("replaces a quoted sentence, however the model punctuated it", () => {
    const out = redactQuotes(
      'You wrote, "I walked by the river this morning and felt calm and grateful." That sounds good.',
      entry,
    );
    expect(out).not.toMatch(/walked by the river/i);
    expect(out).toContain(M);
    expect(out).toContain("That sounds good.");
  });

  it("replaces a quote that is only part of a sentence, in any case", () => {
    const out = redactQuotes(
      "the MARMALADE on the toast was the best part, you said",
      entry,
    );
    expect(out).toBe(`${M}, you said`);
  });

  it("replaces the title when the answer names it", () => {
    const out = redactQuotes(
      "In 'A slow morning by the river' you seemed at ease.",
      entry,
    );
    expect(out).not.toMatch(/slow morning/i);
    expect(out).toContain("you seemed at ease");
  });

  it(`leaves alone text that shares fewer than ${RUN} words in a row`, () => {
    const text =
      "You often write about the river and the morning, and sometimes feel calm.";
    expect(redactQuotes(text, entry)).toBe(text);
  });

  it("changes nothing when there is nothing in common", () => {
    const text = "You slept well and had a busy day at work.";
    expect(redactQuotes(text, entry)).toBe(text);
  });

  it("handles every shape of input without throwing", () => {
    expect(redactQuotes("", entry)).toBe("");
    expect(redactQuotes(undefined, entry)).toBe("");
    expect(redactQuotes("hello there", { title: null, content: null })).toBe(
      "hello there",
    );
    expect(redactQuotes("hello there", undefined)).toBe("hello there");
    expect(redactQuotes("!!! ??? ...", entry)).toBe("!!! ??? ...");
  });

  it("matches non-English text and curly apostrophes", () => {
    const e = {
      title: null,
      content: "Hoy fui al mercado con mi hermano y compramos naranjas dulces",
    };
    const out = redactQuotes(
      "Dijiste: fui al mercado con mi hermano y compramos naranjas.",
      e,
    );
    expect(out).not.toMatch(/mercado/);
    const e2 = {
      title: null,
      content: "I couldn't stop thinking about what she said to me",
    };
    expect(
      redactQuotes(
        "you wrote: I couldn’t stop thinking about what she said",
        e2,
      ),
    ).not.toMatch(/thinking/);
  });

  it("a very short entry is matched whole, and a single word is not chased", () => {
    const short = { title: null, content: "Feeling anxious today" };
    expect(
      redactQuotes("You wrote 'feeling anxious today' on Monday.", short),
    ).toBe(`You wrote '${M}' on Monday.`);
    const one = { title: null, content: "Tired" };
    const text = "You said you were tired again.";
    expect(redactQuotes(text, one)).toBe(text);
  });

  it("marks each separate quote, and leaves the words between them", () => {
    const out = redactQuotes(
      "First: I walked by the river this morning. Then: the marmalade on the toast was lovely.",
      entry,
    );
    expect(out.match(/\[entry removed\]/g)).toHaveLength(2);
    expect(out).toContain("Then:");
    expect(out).toContain("lovely");
  });
});
