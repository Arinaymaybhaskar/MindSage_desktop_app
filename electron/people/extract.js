// The extraction step of the People section: the prompt, the JSON schema the
// model's answer is held to, and the checks that run on that answer.
//
// The model only proposes. Code checks every claim before anything is stored:
// a name must appear in the entry (or be a known alias of the person it is
// linked to), sentence numbers must exist, and a relationship is kept only if
// a relationship word is actually in that person's sentences. Pure, like
// text.js, so all of it is unit tested.

import {
  containsName,
  excerptAround,
  normaliseName,
  RELATIONSHIP_WORDS,
} from "./text.js";
import { RELATIONSHIPS, relationshipFromWord } from "./identity.js";

/**
 * Bump when the prompt, schema or checks change in a way that should
 * re-process entries. Old mentions keep showing until their entry is redone,
 * and user-verified mentions are never overwritten.
 */
export const EXTRACTOR_VERSION = 1;

export const FEELINGS = [
  "supported",
  "loved",
  "grateful",
  "happy",
  "proud",
  "close",
  "calm",
  "missing",
  "worried",
  "sad",
  "hurt",
  "frustrated",
  "angry",
  "anxious",
  "guilty",
  "distant",
  "confused",
];

/** Held by Ollama's structured output (`format` takes a JSON schema). */
export const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    people: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name_as_written: { type: "string" },
          known_id: { type: "integer" },
          sentences: { type: "array", items: { type: "integer" } },
          relationship: { type: "string", enum: [...RELATIONSHIPS, "none"] },
          valence: { type: "integer", minimum: -2, maximum: 2 },
          feelings: {
            type: "array",
            items: { type: "string", enum: FEELINGS },
          },
          confidence: { type: "number" },
        },
        required: [
          "name_as_written",
          "known_id",
          "sentences",
          "relationship",
          "valence",
        ],
      },
    },
  },
  required: ["people"],
};

export const FEELING_SCHEMA = {
  type: "object",
  properties: {
    valence: { type: "integer", minimum: -2, maximum: 2 },
    feelings: { type: "array", items: { type: "string", enum: FEELINGS } },
  },
  required: ["valence"],
};

/**
 * Fixed instructions first, the known-people list next, the entry last, so
 * consecutive calls share the longest possible prefix for the model's cache.
 *
 * @param {{ sentences: Array<{index:number,text:string}>,
 *           knownPeople?: Array<{id:number,display_name:string,relationship?:string|null,aliases:string[]}>,
 *           ignored?: string[] }} input
 */
export function buildExtractionPrompt({
  sentences,
  knownPeople = [],
  ignored = [],
}) {
  const known = knownPeople.length
    ? knownPeople
        .map((p) => {
          const aliases = p.aliases.filter(
            (a) => normaliseName(a) !== normaliseName(p.display_name),
          );
          return `- id ${p.id}: ${p.display_name}${
            p.relationship ? ` (${p.relationship})` : ""
          }${aliases.length ? `, also called ${aliases.join(", ")}` : ""}`;
        })
        .join("\n")
    : "(none yet)";
  const numbered = sentences.map((s) => `[${s.index}] ${s.text}`).join("\n");

  return `You read one private journal entry and list the people the writer knows personally who are mentioned in it.

Rules:
- Only real people the writer knows: family, friends, partners, colleagues, teachers. Not celebrities, authors, brands, places, pets, God, or the writer themself.
- name_as_written: the name or family word exactly as it appears in the entry ("Priya", "Mum", "my boss"). Never invent a name.
- known_id: the id from the KNOWN PEOPLE list if this is clearly that person, otherwise 0.
- sentences: the [numbers] of the sentences that mention or are about this person.
- relationship: only if the entry states it in words ("my sister Priya" is sister). Otherwise "none". Never guess from tone.
- valence: how the writer felt about this person in those sentences only, from -2 (very negative) to 2 (very positive), 0 if neutral or unclear.
- feelings: up to 3 words from the allowed list that describe how the writer felt about this person.
- confidence: 0 to 1, how sure you are this is a person the writer knows.
- If nobody is mentioned, return {"people": []}.

Never list these names: ${ignored.length ? ignored.join(", ") : "(none)"}

KNOWN PEOPLE:
${known}

ENTRY (numbered sentences):
${numbered}

Answer with JSON only.`;
}

export function buildFeelingPrompt(name, excerpt) {
  return `Here are some lines from a private journal entry. How did the writer feel about ${name} in these lines? Judge only feelings about ${name}, not about anyone else in the lines.

valence: -2 (very negative) to 2 (very positive), 0 if neutral or unclear.
feelings: up to 3 words from the allowed list.

LINES:
${excerpt}

Answer with JSON only.`;
}

/** JSON.parse that also accepts an object wrapped in prose or a code fence. */
export function parseModelJson(raw) {
  if (raw && typeof raw === "object") return raw;
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch {
    const first = raw.indexOf("{");
    const last = raw.lastIndexOf("}");
    if (first === -1 || last <= first) return null;
    try {
      return JSON.parse(raw.slice(first, last + 1));
    } catch {
      return null;
    }
  }
}

function clampValence(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 0;
  return Math.max(-2, Math.min(2, n));
}

function cleanFeelings(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const f of list) {
    const word = String(f).toLowerCase().trim();
    if (FEELINGS.includes(word) && !out.includes(word)) out.push(word);
  }
  return out.slice(0, 3);
}

/**
 * The relationship this person's own sentences state in words, or null.
 * "My sister Priya" gives sister; "Mum" on its own gives mother. The model's
 * suggestion is kept only if those words back it up.
 */
function groundedRelationship(modelValue, nameAsWritten, sentenceTexts) {
  const fromName = relationshipFromWord(nameAsWritten);
  if (fromName) return fromName;
  if (!modelValue || !RELATIONSHIPS.includes(modelValue)) return null;
  const text = sentenceTexts.join(" ");
  for (const word of RELATIONSHIP_WORDS) {
    if (relationshipFromWord(word) === modelValue && containsName(text, word))
      return modelValue;
  }
  // "parent", "sibling", "classmate" and "other" have no single word in the
  // list; accept them only when the word itself is there.
  if (containsName(text, modelValue)) return modelValue;
  return null;
}

/**
 * Checks the model's answer against the entry and returns only what holds up.
 *
 * @param {unknown} raw - the model's response text or parsed object.
 * @param {{ text: string,
 *           sentences: Array<{index:number,start:number,end:number,text:string}>,
 *           knownPeople?: Array<{id:number,aliases:string[]}>,
 *           ignored?: string[] }} ctx
 * @returns {Array<{ nameAsWritten: string, knownId: number|null,
 *   sentences: number[], relationship: string|null, valence: number,
 *   feelings: string[], confidence: number }>}
 */
export function groundExtraction(raw, ctx) {
  const parsed = parseModelJson(raw);
  const list = Array.isArray(parsed?.people) ? parsed.people : [];
  const { text, sentences, knownPeople = [], ignored = [] } = ctx;
  const ignoredSet = new Set(ignored.map(normaliseName));
  const knownById = new Map(knownPeople.map((p) => [p.id, p]));
  const byName = new Map();

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const nameAsWritten = String(item.name_as_written ?? "").trim();
    const key = normaliseName(nameAsWritten);
    if (!key || key === "i" || key === "me" || key === "myself") continue;
    if (ignoredSet.has(key)) continue;

    // The name must be in the entry. A known person's alias also counts,
    // but only when the model linked it to that same person.
    let knownId =
      Number.isInteger(item.known_id) && item.known_id > 0
        ? item.known_id
        : null;
    const known = knownId != null ? knownById.get(knownId) : null;
    if (!known) knownId = null;
    const inText = containsName(text, nameAsWritten);
    if (!inText) continue;

    // Sentence numbers have to exist. If none do, fall back to the
    // sentences that actually contain the name; if there are none of those
    // either the claim is dropped.
    let idx = Array.isArray(item.sentences)
      ? item.sentences.filter(
          (n) => Number.isInteger(n) && n >= 1 && n <= sentences.length,
        )
      : [];
    const withName = sentences
      .filter((s) => containsName(s.text, nameAsWritten))
      .map((s) => s.index);
    if (!idx.length) idx = withName;
    else idx = [...new Set([...idx, ...withName])];
    if (!idx.length) continue;
    idx.sort((a, b) => a - b);

    // A link to a known person stands only if this exact name is one of
    // their aliases. Anything looser goes to the inbox as a question.
    if (known && !known.aliases.some((a) => normaliseName(a) === key)) {
      knownId = null;
    }

    const sentenceTexts = idx.map((i) => sentences[i - 1].text);
    const candidate = {
      nameAsWritten,
      knownId,
      sentences: idx,
      relationship: groundedRelationship(
        item.relationship,
        nameAsWritten,
        sentenceTexts,
      ),
      valence: clampValence(item.valence),
      feelings: cleanFeelings(item.feelings),
      confidence: Math.max(0, Math.min(1, Number(item.confidence ?? 0.5))),
    };

    const existing = byName.get(key);
    if (existing) {
      existing.sentences = [
        ...new Set([...existing.sentences, ...candidate.sentences]),
      ].sort((a, b) => a - b);
      existing.relationship ??= candidate.relationship;
      existing.knownId ??= candidate.knownId;
    } else {
      byName.set(key, candidate);
    }
  }
  return [...byName.values()];
}

/**
 * Whether the per-person second pass is needed: any entry with two or more
 * people. A single whole-entry judgement smears one person's feeling onto
 * another ("fought with Mom, Dad cheered me up" scores both negative), and
 * when it does, the first pass agrees with itself, so its scores cannot be
 * used to decide. The second pass is short: one person's lines only.
 */
export function needsFeelingPass(mentions) {
  return mentions.length >= 2;
}

export function feelingExcerpt(sentences, indexes) {
  return excerptAround(sentences, indexes);
}

export function parseFeeling(raw) {
  const parsed = parseModelJson(raw);
  if (!parsed || parsed.valence === undefined) return null;
  return {
    valence: clampValence(parsed.valence),
    feelings: cleanFeelings(parsed.feelings),
  };
}
