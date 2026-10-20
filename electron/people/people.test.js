import { describe, it, expect } from "vitest";
import {
  containsName,
  contentHash,
  excerptAround,
  findName,
  normaliseName,
  sentenceRuns,
  shouldExtract,
  splitSentences,
} from "./text.js";
import {
  buildAliasIndex,
  displayNameFor,
  isNearMatch,
  relationshipFromWord,
  resolveName,
  sameAsCandidates,
} from "./identity.js";
import {
  buildExtractionPrompt,
  groundExtraction,
  needsFeelingPass,
  parseFeeling,
  parseModelJson,
} from "./extract.js";
import {
  feelingTrend,
  groundSummary,
  isJudgement,
  mentionsHash,
} from "./insights.js";

describe("normaliseName", () => {
  it("folds case, accents, possessives and a leading my", () => {
    expect(normaliseName("My Mum's")).toBe("mum");
    expect(normaliseName("Zoë")).toBe("zoe");
    expect(normaliseName("  Priya   Sharma ")).toBe("priya sharma");
  });
});

describe("findName", () => {
  it("matches whole words only, ignoring case and accents", () => {
    expect(findName("I met Zoë and zoe today", "Zoe")).toEqual([6, 14]);
    expect(containsName("Amanda called", "Am")).toBe(false);
    expect(containsName("talked to mum's friend", "Mum")).toBe(true);
  });

  it("keeps offsets aligned with the original text", () => {
    const text = "Café with José. Then José left.";
    const [first, second] = findName(text, "jose");
    expect(text.slice(first, first + 4)).toBe("José");
    expect(text.slice(second, second + 4)).toBe("José");
  });
});

describe("splitSentences", () => {
  it("numbers sentences from 1 and keeps their offsets", () => {
    const text = "Had lunch with Priya. She was great!\nThen Dad called?  Yes.";
    const s = splitSentences(text);
    expect(s.map((x) => x.text)).toEqual([
      "Had lunch with Priya.",
      "She was great!",
      "Then Dad called?",
      "Yes.",
    ]);
    expect(s[0].index).toBe(1);
    for (const x of s) expect(text.slice(x.start, x.end)).toBe(x.text);
  });

  it("returns nothing for empty text", () => {
    expect(splitSentences("   ")).toEqual([]);
  });
});

describe("shouldExtract", () => {
  const filler =
    "today was a long day and i spent most of it working on the report at my desk";

  it("skips short entries", () => {
    expect(shouldExtract("Priya came over.")).toBe(false);
  });

  it("skips long entries with no sign of a person", () => {
    expect(shouldExtract(`${filler}. It rained.`)).toBe(false);
    expect(shouldExtract(`Today ${filler}. The rain stopped.`)).toBe(false);
  });

  it("counts a name that opens a sentence", () => {
    expect(shouldExtract(`Priya called and ${filler}.`)).toBe(true);
  });

  it("runs for a relationship word, a known alias or a mid-sentence name", () => {
    expect(shouldExtract(`${filler} and then mom called.`)).toBe(true);
    expect(shouldExtract(`${filler} and then bubs called.`, ["Bubs"])).toBe(
      true,
    );
    expect(shouldExtract(`${filler} and then Priya called.`)).toBe(true);
  });
});

describe("contentHash", () => {
  it("is stable and changes with the text", () => {
    expect(contentHash("abc")).toBe(contentHash("abc"));
    expect(contentHash("abc")).not.toBe(contentHash("abd"));
  });
});

describe("sentence helpers", () => {
  const s = splitSentences("One. Two. Three. Four. Five.");

  it("excerptAround adds one sentence either side", () => {
    expect(excerptAround(s, [3])).toBe("Two. Three. Four.");
    expect(excerptAround(s, [1])).toBe("One. Two.");
  });

  it("sentenceRuns groups contiguous sentences into spans", () => {
    const runs = sentenceRuns(s, [2, 3, 5, 99]);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toEqual({ start: s[1].start, end: s[2].end });
    expect(runs[1]).toEqual({ start: s[4].start, end: s[4].end });
  });
});

describe("identity rules", () => {
  it("treats family words across languages as a question, not a match", () => {
    expect(isNearMatch("Mum", "Amma")).toBe(true);
    expect(isNearMatch("Papa", "Dad")).toBe(true);
    expect(isNearMatch("Priya", "Priya Sharma")).toBe(true);
    expect(isNearMatch("Mum", "Dad")).toBe(false);
    expect(isNearMatch("Mum", "mum")).toBe(false);
  });

  it("reads relationships from family words", () => {
    expect(relationshipFromWord("Amma")).toBe("mother");
    expect(relationshipFromWord("bhai")).toBe("brother");
    expect(relationshipFromWord("Priya")).toBe(null);
  });

  const index = buildAliasIndex([
    { person_id: 1, alias_normalised: "priya", status: "confirmed" },
    { person_id: 2, alias_normalised: "sam", status: "confirmed" },
    { person_id: 3, alias_normalised: "sam", status: "confirmed" },
    { person_id: 4, alias_normalised: "netflix", status: "ignored" },
    { person_id: 5, alias_normalised: "ravi", status: "suggested" },
  ]);

  it("links only an exact alias of exactly one confirmed person", () => {
    expect(resolveName("PRIYA", index)).toEqual({
      kind: "confirmed",
      personId: 1,
    });
    expect(resolveName("Sam", index).kind).toBe("ambiguous");
    expect(resolveName("Netflix", index)).toEqual({ kind: "ignored" });
    expect(resolveName("Ravi", index)).toEqual({
      kind: "suggested",
      personId: 5,
    });
    expect(resolveName("Meera", index)).toEqual({ kind: "new" });
  });

  it("asks whether a suggestion is the same as a confirmed person", () => {
    const people = [
      { id: 1, status: "confirmed", aliases: ["Amma"] },
      { id: 2, status: "suggested", aliases: ["Mum"] },
      { id: 3, status: "suggested", aliases: ["Ravi"] },
    ];
    expect(sameAsCandidates(people)).toEqual([
      { suggestedId: 2, confirmedId: 1 },
    ]);
  });

  it("makes a display name from what was written", () => {
    expect(displayNameFor("my mum's")).toBe("Mum");
    expect(displayNameFor("Priya")).toBe("Priya");
  });
});

describe("groundExtraction", () => {
  const text =
    "I fought with Mom about the trip. Dad cheered me up later. Watched Netflix.";
  const sentences = splitSentences(text);
  const ctx = {
    text,
    sentences,
    knownPeople: [{ id: 7, aliases: ["Dad", "Papa"] }],
    ignored: ["Netflix"],
  };

  it("drops invented names, ignored names and the writer", () => {
    const out = groundExtraction(
      {
        people: [
          { name_as_written: "Priya", known_id: 0, sentences: [1], valence: 1 },
          {
            name_as_written: "Netflix",
            known_id: 0,
            sentences: [3],
            valence: 1,
          },
          { name_as_written: "I", known_id: 0, sentences: [1], valence: 0 },
          { name_as_written: "Mom", known_id: 0, sentences: [1], valence: -2 },
        ],
      },
      ctx,
    );
    expect(out.map((m) => m.nameAsWritten)).toEqual(["Mom"]);
  });

  it("checks sentence numbers and falls back to sentences with the name", () => {
    const out = groundExtraction(
      JSON.stringify({
        people: [
          { name_as_written: "Dad", known_id: 7, sentences: [42], valence: 2 },
        ],
      }),
      ctx,
    );
    expect(out[0].sentences).toEqual([2]);
    expect(out[0].knownId).toBe(7);
  });

  it("drops a link to a known person whose aliases do not include the name", () => {
    const out = groundExtraction(
      {
        people: [
          { name_as_written: "Mom", known_id: 7, sentences: [1], valence: -1 },
        ],
      },
      ctx,
    );
    expect(out[0].knownId).toBe(null);
  });

  it("keeps a relationship only when words in the entry state it", () => {
    const t = "Lunch with my sister Priya. Then Ravi joined us for coffee.";
    const s = splitSentences(t);
    const out = groundExtraction(
      {
        people: [
          {
            name_as_written: "Priya",
            known_id: 0,
            sentences: [1],
            relationship: "sister",
            valence: 1,
          },
          {
            name_as_written: "Ravi",
            known_id: 0,
            sentences: [2],
            relationship: "partner",
            valence: 1,
          },
        ],
      },
      { text: t, sentences: s },
    );
    expect(out.find((m) => m.nameAsWritten === "Priya").relationship).toBe(
      "sister",
    );
    expect(out.find((m) => m.nameAsWritten === "Ravi").relationship).toBe(null);
    // A family word is its own relationship.
    expect(
      groundExtraction(
        { people: [{ name_as_written: "Mom", sentences: [1], valence: 0 }] },
        ctx,
      )[0].relationship,
    ).toBe("mother");
  });

  it("clamps valence, filters feelings and survives junk", () => {
    const out = groundExtraction(
      {
        people: [
          {
            name_as_written: "Mom",
            sentences: [1],
            valence: -9,
            feelings: ["angry", "toxic", "angry", "hurt"],
          },
        ],
      },
      ctx,
    );
    expect(out[0].valence).toBe(-2);
    expect(out[0].feelings).toEqual(["angry", "hurt"]);
    expect(groundExtraction("not json", ctx)).toEqual([]);
    expect(groundExtraction({ people: "nope" }, ctx)).toEqual([]);
  });

  it("asks for a per-person feeling pass whenever two people share an entry", () => {
    expect(needsFeelingPass([{ valence: -2 }, { valence: -2 }])).toBe(true);
    expect(needsFeelingPass([{ valence: -1 }])).toBe(false);
  });

  it("parses fenced or wrapped JSON", () => {
    expect(parseModelJson('Sure! {"people": []} done')).toEqual({
      people: [],
    });
    expect(parseFeeling('{"valence": 3, "feelings": ["sad"]}')).toEqual({
      valence: 2,
      feelings: ["sad"],
    });
  });

  it("puts the known people and the entry in the prompt", () => {
    const prompt = buildExtractionPrompt({
      sentences,
      knownPeople: [
        {
          id: 7,
          display_name: "Dad",
          relationship: "father",
          aliases: ["Dad", "Papa"],
        },
      ],
      ignored: ["Netflix"],
    });
    expect(prompt).toContain("id 7: Dad (father), also called Papa");
    expect(prompt).toContain("[2] Dad cheered me up later.");
    expect(prompt).toContain("Never list these names: Netflix");
  });
});

describe("feelingTrend", () => {
  it("needs three entries before showing anything", () => {
    expect(
      feelingTrend([
        { entry_id: 1, created_at: "2026-01-01", valence: 1 },
        { entry_id: 2, created_at: "2026-01-02", valence: 1 },
      ]),
    ).toEqual([]);
  });

  it("averages per entry, then rolls over the window", () => {
    const trend = feelingTrend([
      { entry_id: 3, created_at: "2026-01-03", valence: -2 },
      { entry_id: 1, created_at: "2026-01-01", valence: 2 },
      { entry_id: 1, created_at: "2026-01-01", valence: 0 },
      { entry_id: 2, created_at: "2026-01-02", valence: 2 },
      { entry_id: 4, created_at: "2026-01-04", valence: null },
    ]);
    expect(trend.map((p) => p.entryId)).toEqual([1, 2, 3]);
    expect(trend.map((p) => p.value)).toEqual([1, 1.5, 0.33]);
  });
});

describe("groundSummary", () => {
  const excerpts = [
    { n: 1, entryId: 10 },
    { n: 2, entryId: 20 },
  ];

  it("keeps lines that cite real excerpts and drops judgements", () => {
    const lines = groundSummary(
      {
        lines: [
          { text: "You often felt supported after calls.", sources: [1, 2, 9] },
          { text: "No sources here.", sources: [] },
          { text: "This relationship seems toxic.", sources: [1] },
          { text: "You should call more.", sources: [2] },
        ],
      },
      excerpts,
    );
    expect(lines).toEqual([
      { text: "You often felt supported after calls.", entryIds: [10, 20] },
    ]);
  });

  it("flags advice and verdicts", () => {
    expect(isJudgement("A healthy friendship")).toBe(true);
    expect(isJudgement("You wrote about dinners together")).toBe(false);
  });

  it("hashes mentions so a summary goes stale when they change", () => {
    const a = [
      { id: 1, entry_id: 1, sentence_start: 0, sentence_end: 5, valence: 1 },
    ];
    const b = [{ ...a[0], valence: -1 }];
    expect(mentionsHash(a)).not.toBe(mentionsHash(b));
  });
});
