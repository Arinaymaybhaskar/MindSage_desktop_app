import { describe, expect, it } from "vitest";
import { createTokenizer } from "./bpe.js";
import {
  GOEMOTIONS,
  entailment,
  feelingsFromLogits,
  pairIds,
  summarySentences,
  windows,
} from "./classify.js";
import { builtInFeeling } from "../methods/AIPrompts.js";

// A tiny vocabulary in RoBERTa's spelling: "Ġ" is a space byte.
const tokenizer = createTokenizer({
  model: {
    vocab: { h: 5, i: 6, hi: 7, Ġ: 8, Ġhi: 9, "!": 10 },
    merges: ["h i", "Ġ hi"],
  },
  added_tokens: [
    { id: 0, content: "<s>" },
    { id: 1, content: "<pad>" },
    { id: 2, content: "</s>" },
    { id: 3, content: "<unk>" },
  ],
});

describe("RoBERTa byte-level BPE (KAN-388)", () => {
  it("merges by rank and keeps the space on the next word", () => {
    expect(tokenizer.encode("hi hi!")).toEqual([7, 9, 10]);
  });

  it("gives <unk> for what the vocabulary lacks", () => {
    expect(tokenizer.encode("x")).toEqual([3]);
  });

  it("builds RoBERTa's pair input, cutting the longer side first", () => {
    expect(pairIds([1, 2, 3, 4, 5, 6], [7, 8], tokenizer, 10)).toEqual([
      0, 1, 2, 3, 4, 2, 2, 7, 8, 2,
    ]);
  });
});

describe("what the classifier's numbers mean", () => {
  it("maps every GoEmotions label to a built-in feeling word or none", () => {
    expect(GOEMOTIONS).toHaveLength(28);
    for (const [, word] of GOEMOTIONS)
      if (word) expect(builtInFeeling(word)?.name).toBe(word);
  });

  it("keeps labels any window feels strongly, strongest first, no repeats", () => {
    const row = (hot) => GOEMOTIONS.map(([label]) => hot[label] ?? -5);
    const words = feelingsFromLogits([
      row({ sadness: 3, joy: -0.2 }),
      row({ grief: 1, neutral: 4, gratitude: 0.1, joy: 0 }),
    ]);
    // sadness 0.95, grief 0.73, gratitude 0.52 and joy 0.5 (both Content).
    expect(words).toEqual(["Hurt", "Despair", "Content"]);
  });

  it("reads entailment from the NLI logits", () => {
    expect(entailment([0, 5, 0])).toBeGreaterThan(0.98);
    expect(entailment([5, 0, 0])).toBeLessThan(0.01);
  });

  it("splits text into windows and a summary into sentences", () => {
    expect(windows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(windows([1, 2, 3, 4], 3, 2)).toEqual([
      [1, 2, 3],
      [3, 4],
    ]);
    expect(summarySentences("She walked. Then? It rained!  ")).toEqual([
      "She walked.",
      "Then?",
      "It rained!",
    ]);
  });
});
