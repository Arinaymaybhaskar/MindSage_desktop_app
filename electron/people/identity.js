// Identity rules for the People section: which name belongs to which person.
//
// Rules run before the model and outrank it. Only an exact alias match to a
// confirmed person links on its own. A near match (Mum and Amma, Priya and
// Priya Sharma) becomes a question in the "Someone new?" inbox, never an
// automatic merge. Pure, like text.js.

import { normaliseName } from "./text.js";

/**
 * Words for the same family role across English and the Indian languages the
 * app's users write in. Two names in one group are a "same person?" question,
 * never a silent match.
 */
export const FAMILY_GROUPS = [
  [
    "mum",
    "mom",
    "mother",
    "mummy",
    "mommy",
    "ma",
    "maa",
    "amma",
    "ammi",
    "mumma",
  ],
  ["dad", "father", "daddy", "papa", "pa", "baba", "abba", "pappa", "pitaji"],
  ["brother", "bro", "bhai", "bhaiya", "dada"],
  ["sister", "sis", "didi", "behen"],
  ["grandma", "grandmother", "granny", "nani", "dadi"],
  ["grandpa", "grandfather", "nanaji", "dadaji"],
];

const GROUP_OF = new Map();
FAMILY_GROUPS.forEach((group, i) => {
  for (const word of group) GROUP_OF.set(word, i);
});

/** The relationship each family word implies on its own. */
const RELATIONSHIP_FROM_WORD = {
  mum: "mother",
  mom: "mother",
  mother: "mother",
  mummy: "mother",
  mommy: "mother",
  maa: "mother",
  amma: "mother",
  ammi: "mother",
  mumma: "mother",
  dad: "father",
  father: "father",
  daddy: "father",
  papa: "father",
  baba: "father",
  abba: "father",
  pappa: "father",
  pitaji: "father",
  brother: "brother",
  bhai: "brother",
  bhaiya: "brother",
  sister: "sister",
  didi: "sister",
  behen: "sister",
  grandma: "grandparent",
  grandmother: "grandparent",
  granny: "grandparent",
  nani: "grandparent",
  dadi: "grandparent",
  grandpa: "grandparent",
  grandfather: "grandparent",
  nanaji: "grandparent",
  dadaji: "grandparent",
  wife: "partner",
  husband: "partner",
  partner: "partner",
  boyfriend: "partner",
  girlfriend: "partner",
  fiance: "partner",
  fiancee: "partner",
  son: "child",
  daughter: "child",
  aunt: "relative",
  uncle: "relative",
  cousin: "relative",
  friend: "friend",
  boss: "manager",
  manager: "manager",
  colleague: "colleague",
  coworker: "colleague",
  teacher: "teacher",
  roommate: "roommate",
  flatmate: "roommate",
  neighbour: "neighbour",
  neighbor: "neighbour",
  therapist: "therapist",
};

export const RELATIONSHIPS = [
  "mother",
  "father",
  "parent",
  "brother",
  "sister",
  "sibling",
  "grandparent",
  "partner",
  "child",
  "relative",
  "friend",
  "manager",
  "colleague",
  "teacher",
  "classmate",
  "roommate",
  "neighbour",
  "therapist",
  "other",
];

export function relationshipFromWord(word) {
  return RELATIONSHIP_FROM_WORD[normaliseName(word)] ?? null;
}

/**
 * Whether two names could be the same person without being the same alias:
 * the same family role in different words, or one name being the first word
 * of the other ("Priya" and "Priya Sharma").
 */
export function isNearMatch(a, b) {
  const x = normaliseName(a);
  const y = normaliseName(b);
  if (!x || !y || x === y) return false;
  const gx = GROUP_OF.get(x);
  if (gx !== undefined && gx === GROUP_OF.get(y)) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 3 && long.startsWith(short + " ");
}

/**
 * Builds the lookup the resolver uses from rows of
 * { person_id, status, alias_normalised }.
 */
export function buildAliasIndex(rows) {
  const index = new Map();
  for (const row of rows) {
    const key = row.alias_normalised;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push({ personId: row.person_id, status: row.status });
  }
  return index;
}

/**
 * What a name found in an entry should link to.
 *
 * - `ignored`: the name is on the ignore list (a brand, a celebrity, someone
 *   the user stopped tracking). Dropped.
 * - `confirmed`: exactly one confirmed person has this exact alias. Linked.
 * - `ambiguous`: two or more confirmed people share it. Never linked to
 *   either; it goes to (or joins) a suggestion so the inbox asks which.
 * - `suggested`: an existing suggestion has it. Linked to the suggestion.
 * - `new`: nobody has it. A new suggestion is made.
 */
export function resolveName(name, index) {
  const key = normaliseName(name);
  const hits = index.get(key) ?? [];
  if (hits.some((h) => h.status === "ignored")) return { kind: "ignored" };
  const confirmed = hits.filter((h) => h.status === "confirmed");
  if (confirmed.length === 1)
    return { kind: "confirmed", personId: confirmed[0].personId };
  const suggested = hits.find((h) => h.status === "suggested");
  if (confirmed.length > 1)
    return {
      kind: "ambiguous",
      personIds: confirmed.map((h) => h.personId),
      suggestedId: suggested?.personId ?? null,
    };
  if (suggested) return { kind: "suggested", personId: suggested.personId };
  return { kind: "new" };
}

/**
 * "Is Mum the same as Amma?" questions for the inbox: pairs of a suggested
 * person and a confirmed person with a near-matching or identical alias. An
 * identical one only reaches a suggestion when two confirmed people share
 * the name, which is exactly when the user has to say which.
 *
 * @param {Array<{id:number, display_name:string, status:string, aliases:string[]}>} people
 */
export function sameAsCandidates(people) {
  const confirmed = people.filter((p) => p.status === "confirmed");
  const out = [];
  for (const s of people.filter((p) => p.status === "suggested")) {
    for (const c of confirmed) {
      const hit = s.aliases.some((a) =>
        c.aliases.some(
          (b) => isNearMatch(a, b) || normaliseName(a) === normaliseName(b),
        ),
      );
      if (hit) {
        out.push({ suggestedId: s.id, confirmedId: c.id });
        break;
      }
    }
  }
  return out;
}

/** "Mum" for a family word, otherwise the name as the user wrote it. */
export function displayNameFor(nameAsWritten) {
  const trimmed = String(nameAsWritten ?? "")
    .trim()
    .replace(/^(my|our)\s+/i, "")
    .replace(/[’']s$/i, "");
  if (!trimmed) return "";
  return trimmed[0].toUpperCase() + trimmed.slice(1);
}
