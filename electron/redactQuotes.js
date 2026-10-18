// When an entry is deleted for good, saved Ask answers that quoted it must not
// keep its words. The model's quotes are free text (whole sentences, half a
// sentence, reworded punctuation), so this does not look for exact strings: it
// finds every run of RUN consecutive words that also appears, in the same
// order, in the entry, and replaces each such run with a marker. Pure, so it
// is tested without a database.

export const REMOVED_MARKER = "[entry removed]";

/** Words in this many in a row, shared with the entry, count as a quote. */
export const RUN = 5;

// A word may contain apostrophes and hyphens, but not end on one, so a closing
// quote mark is never part of the last word.
// Combining marks (\p{M}) belong to the word: Hindi vowel signs, accents.
// Scripts written without spaces (Japanese, Chinese, Thai) come out as long
// tokens, so a quote in them is only caught when it is a whole clause; that is
// a known limit.
const WORD = /[\p{L}\p{N}\p{M}]+(?:['’_-][\p{L}\p{N}\p{M}]+)*/gu;
const norm = (w) => w.normalize("NFC").toLowerCase().replace(/[’]/g, "'");

const tokens = (text) =>
  [...String(text ?? "").matchAll(WORD)].map((m) => ({
    word: norm(m[0]),
    start: m.index,
    end: m.index + m[0].length,
  }));

const grams = (words, n) => {
  const set = new Set();
  for (let i = 0; i + n <= words.length; i++)
    set.add(words.slice(i, i + n).join(" "));
  return set;
};

/**
 * @param {string} message  the saved answer
 * @param {{ title?: string | null, content?: string | null }} entry
 * @returns {string} the answer with quoted runs replaced
 */
export function redactQuotes(message, entry) {
  const text = String(message ?? "");
  const found = tokens(text);
  if (!found.length) return text;

  // What counts as a quote of this entry: runs from its text, and its title
  // when that is a phrase of its own (a title shorter than RUN words can only
  // match as a whole).
  const body = tokens(entry?.content).map((t) => t.word);
  const title = tokens(entry?.title).map((t) => t.word);
  const needles = [grams(body, Math.min(RUN, Math.max(body.length, 1)))];
  if (title.length >= 2)
    needles.push(grams(title, Math.min(RUN, title.length)));
  const sizes = [Math.min(RUN, Math.max(body.length, 1))];
  if (title.length >= 2) sizes.push(Math.min(RUN, title.length));

  // Mark every message word that sits inside a matching run.
  const hit = new Array(found.length).fill(false);
  const words = found.map((t) => t.word);
  needles.forEach((set, k) => {
    const n = sizes[k];
    // A one-word entry is too weak a quote to chase.
    if (n < 2 && set.size && body.length < 2 && k === 0) return;
    for (let i = 0; i + n <= words.length; i++) {
      if (set.has(words.slice(i, i + n).join(" "))) {
        for (let j = i; j < i + n; j++) hit[j] = true;
      }
    }
  });

  // Merge touching marked words into one span each, then replace right to left.
  const spans = [];
  for (let i = 0; i < found.length; i++) {
    if (!hit[i]) continue;
    const last = spans[spans.length - 1];
    if (last && last.lastIndex === i - 1) {
      last.end = found[i].end;
      last.lastIndex = i;
    } else {
      spans.push({ start: found[i].start, end: found[i].end, lastIndex: i });
    }
  }
  let out = text;
  for (const s of spans.reverse()) {
    out = out.slice(0, s.start) + REMOVED_MARKER + out.slice(s.end);
  }
  return out;
}
