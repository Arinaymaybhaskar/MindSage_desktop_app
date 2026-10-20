// Text helpers for the People section.
//
// Pure: no electron, no database, no node builtins, so every function here is
// unit tested in people.test.js. The extraction queue in
// electron/methods/people.js is the only caller.

/**
 * Words that say the writer is talking about someone even when no capitalised
 * name appears ("mom called", "my boss"). Used by the cheap pre-check that
 * decides whether an entry is worth an AI call at all, and by the identity
 * rules to recognise family words across languages.
 */
export const RELATIONSHIP_WORDS = [
  "mom",
  "mum",
  "mother",
  "mummy",
  "mommy",
  "ma",
  "maa",
  "amma",
  "ammi",
  "dad",
  "father",
  "daddy",
  "papa",
  "pa",
  "baba",
  "abba",
  "brother",
  "bro",
  "bhai",
  "bhaiya",
  "sister",
  "sis",
  "didi",
  "behen",
  "grandma",
  "grandmother",
  "granny",
  "nani",
  "dadi",
  "grandpa",
  "grandfather",
  "nanaji",
  "dadaji",
  "wife",
  "husband",
  "partner",
  "boyfriend",
  "girlfriend",
  "fiance",
  "fiancee",
  "son",
  "daughter",
  "aunt",
  "uncle",
  "cousin",
  "friend",
  "boss",
  "manager",
  "colleague",
  "coworker",
  "teacher",
  "roommate",
  "flatmate",
  "neighbour",
  "neighbor",
  "therapist",
];

/**
 * Lower case, accents stripped, whitespace collapsed, a leading "my " and a
 * trailing possessive removed. "My Mum's" and "mum" normalise the same, as do
 * "Zoë" and "Zoe".
 */
export function normaliseName(name) {
  if (typeof name !== "string") return "";
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’']s\b/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(my|our) /, "");
}

/** Accent-stripped lower case with offsets preserved one to one. */
function foldForSearch(text) {
  // NFKD can change string length, so fold character by character and keep
  // only the first code unit of each decomposition. Offsets then line up
  // with the original text, which is what the sentence offsets need.
  let out = "";
  for (const ch of text) {
    const folded = ch.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const piece = folded.length ? folded[0] : " ";
    out += ch.length === 2 ? piece + " " : piece;
  }
  return out;
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

/**
 * Every offset at which `name` appears in `text` as whole words, ignoring case
 * and accents. Returns [] for an empty name.
 */
export function findName(text, name) {
  const needle = normaliseName(name);
  if (!needle || typeof text !== "string") return [];
  const hay = foldForSearch(text);
  const hits = [];
  let from = 0;
  for (;;) {
    const at = hay.indexOf(needle, from);
    if (at === -1) break;
    const before = at > 0 ? hay[at - 1] : " ";
    const after = hay[at + needle.length] ?? " ";
    if (!WORD_CHAR.test(before) && !WORD_CHAR.test(after)) hits.push(at);
    from = at + 1;
  }
  return hits;
}

export function containsName(text, name) {
  return findName(text, name).length > 0;
}

/**
 * Splits text into sentences, keeping each one's character offsets so a
 * mention can point back into the entry instead of copying it. A sentence
 * ends at . ! ? (or a run of them) followed by whitespace, or at a line break.
 * Numbering is 1-based because that is what the prompt shows the model.
 */
export function splitSentences(text) {
  if (typeof text !== "string" || !text.trim()) return [];
  const sentences = [];
  const boundary = /[.!?…]+["')\]]*\s+|\n+/g;
  let start = 0;
  const push = (end) => {
    // Trim leading and trailing whitespace without losing the offsets.
    let s = start;
    let e = end;
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    if (e > s) {
      sentences.push({
        index: sentences.length + 1,
        start: s,
        end: e,
        text: text.slice(s, e),
      });
    }
  };
  let match;
  while ((match = boundary.exec(text)) !== null) {
    push(match.index + match[0].length);
    start = match.index + match[0].length;
  }
  push(text.length);
  return sentences;
}

export function wordCount(text) {
  if (typeof text !== "string") return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

export const MIN_WORDS_FOR_EXTRACTION = 15;

/**
 * Capitalised words that commonly open a sentence and are not names. A
 * capitalised first word outside this list ("Priya called today") counts as a
 * possible name; the model and the grounding checks decide whether it is one.
 */
const SENTENCE_OPENERS = new Set(
  `a about after again all also although an and another any anyway as at
  because before being besides both but by can could did do does doing during
  each either even every everyone everything finally first for from had has
  have having he her here hers him his how however i if in instead is it its
  just last later let lots maybe me meanwhile might more most much my myself
  never next no not nothing now of oh ok okay on once one only or other our
  out overall perhaps please really she should since so some somehow someone
  something sometimes still such that the their them then there these they
  this those though thus to today tomorrow tonight too under until up us very
  was we well were what whatever when where whether which while who why will
  with without woke work would yes yesterday yet you your`.split(/\s+/),
);

/**
 * The cheap pre-check that runs before any AI call. An entry is worth
 * extracting only if it is at least MIN_WORDS_FOR_EXTRACTION words long and
 * has some sign of a person in it: a known alias, a relationship word, or a
 * capitalised word that could be a name (not "I", and not a common word that
 * merely opens a sentence).
 */
export function shouldExtract(text, knownAliases = []) {
  if (wordCount(text) < MIN_WORDS_FOR_EXTRACTION) return false;
  for (const alias of knownAliases) {
    if (containsName(text, alias)) return true;
  }
  for (const word of RELATIONSHIP_WORDS) {
    if (containsName(text, word)) return true;
  }
  for (const sentence of splitSentences(text)) {
    const words = sentence.text.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      const word = words[i].replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
      if (word.length < 2 || !/^\p{Lu}\p{Ll}/u.test(word)) continue;
      if (i > 0 || !SENTENCE_OPENERS.has(word.toLowerCase())) return true;
    }
  }
  return false;
}

/**
 * A stable fingerprint of an entry's text (FNV-1a, 32 bit). Only used to
 * notice that the text changed, never for anything security related, so a
 * fast non-cryptographic hash keeps this module free of node:crypto.
 */
export function contentHash(text) {
  let hash = 0x811c9dc5;
  const s = typeof text === "string" ? text : "";
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0") + ":" + s.length;
}

/**
 * The sentences a person's feeling is judged on: their own sentences plus one
 * either side, joined in order.
 */
export function excerptAround(sentences, indexes) {
  const keep = new Set();
  for (const i of indexes) {
    for (const j of [i - 1, i, i + 1]) {
      if (j >= 1 && j <= sentences.length) keep.add(j);
    }
  }
  return [...keep]
    .sort((a, b) => a - b)
    .map((i) => sentences[i - 1].text)
    .join(" ");
}

/**
 * Groups sorted 1-based sentence indexes into contiguous runs, each stored as
 * one mention row with the character span of the run.
 */
export function sentenceRuns(sentences, indexes) {
  const sorted = [...new Set(indexes)]
    .filter((i) => i >= 1 && i <= sentences.length)
    .sort((a, b) => a - b);
  const runs = [];
  for (const i of sorted) {
    const last = runs[runs.length - 1];
    if (last && last.to === i - 1) last.to = i;
    else runs.push({ from: i, to: i });
  }
  return runs.map(({ from, to }) => ({
    start: sentences[from - 1].start,
    end: sentences[to - 1].end,
  }));
}
