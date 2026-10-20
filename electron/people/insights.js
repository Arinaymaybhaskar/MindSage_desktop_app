// The feeling trend and the "What you've written" summary on a person page.
//
// Both are reflections of what the writer wrote, never verdicts. The trend
// only appears with enough data and is a rolling average, so one wrong score
// barely moves it. Every summary line has to cite the entries it came from;
// a line that cites nothing, or reads as a judgement or advice, is dropped.
// Pure, like text.js.

import { contentHash } from "./text.js";
import { parseModelJson } from "./extract.js";

export const TREND_MIN_MENTIONS = 3;
export const TREND_WINDOW = 3;

/**
 * @param {Array<{entry_id:number, created_at:string, valence:number|null}>} rows
 *   one row per mention; several rows of one entry are averaged first.
 * @returns {Array<{entryId:number, date:string, value:number}>} oldest first,
 *   or [] when there are fewer than TREND_MIN_MENTIONS entries with a feeling.
 */
export function feelingTrend(rows, window = TREND_WINDOW) {
  const byEntry = new Map();
  for (const r of rows) {
    if (r.valence === null || r.valence === undefined) continue;
    const e = byEntry.get(r.entry_id) ?? {
      entryId: r.entry_id,
      date: r.created_at,
      sum: 0,
      n: 0,
    };
    e.sum += Number(r.valence);
    e.n += 1;
    byEntry.set(r.entry_id, e);
  }
  const points = [...byEntry.values()]
    .map((e) => ({ entryId: e.entryId, date: e.date, raw: e.sum / e.n }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (points.length < TREND_MIN_MENTIONS) return [];
  return points.map((p, i) => {
    const slice = points.slice(Math.max(0, i - window + 1), i + 1);
    const value = slice.reduce((s, q) => s + q.raw, 0) / slice.length;
    return {
      entryId: p.entryId,
      date: p.date,
      value: Math.round(value * 100) / 100,
    };
  });
}

/**
 * Words that turn a reflection into a verdict or advice. The page reflects
 * what the user wrote and never judges the relationship.
 */
const JUDGEMENT = [
  "toxic",
  "healthy",
  "unhealthy",
  "abusive",
  "narcissist",
  "manipulative",
  "red flag",
  "you should",
  "you need to",
  "you must",
  "consider ",
  "try to",
  "cut off",
  "cut them off",
];

export function isJudgement(line) {
  const l = ` ${String(line).toLowerCase()} `;
  return JUDGEMENT.some((w) => l.includes(w));
}

export const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          sources: { type: "array", items: { type: "integer" } },
        },
        required: ["text", "sources"],
      },
    },
  },
  required: ["lines"],
};

/**
 * @param {string} name
 * @param {Array<{n:number, date:string, text:string}>} excerpts numbered from 1
 */
export function buildSummaryPrompt(name, excerpts) {
  const body = excerpts
    .map((e) => `[${e.n}] (${String(e.date).slice(0, 10)}) ${e.text}`)
    .join("\n");
  return `Below are numbered excerpts from someone's private journal, each about ${name}. Write 3 to 5 short lines describing what the writer has written about ${name}: recurring moments, how they tended to feel, and how that changed over time.

Rules:
- Speak to the writer as "you" ("You often wrote about feeling supported after calls with ${name}").
- Describe only what the excerpts say. No advice, no diagnosis, no verdict about ${name} or the relationship. Never use words like toxic, healthy or unhealthy.
- Every line lists in sources the [numbers] of the excerpts it is based on.

EXCERPTS:
${body}

Answer with JSON only.`;
}

/**
 * Keeps only lines that cite at least one real excerpt and do not judge,
 * mapping the cited excerpt numbers to entry ids.
 *
 * @param {unknown} raw
 * @param {Array<{n:number, entryId:number}>} excerpts
 * @returns {Array<{text:string, entryIds:number[]}>}
 */
export function groundSummary(raw, excerpts) {
  const parsed = parseModelJson(raw);
  const lines = Array.isArray(parsed?.lines) ? parsed.lines : [];
  const entryOf = new Map(excerpts.map((e) => [e.n, e.entryId]));
  const out = [];
  for (const line of lines) {
    const text = String(line?.text ?? "").trim();
    if (!text || isJudgement(text)) continue;
    const ids = [
      ...new Set(
        (Array.isArray(line.sources) ? line.sources : [])
          .map((n) => entryOf.get(n))
          .filter((id) => id !== undefined),
      ),
    ];
    if (!ids.length) continue;
    out.push({ text, entryIds: ids });
  }
  return out.slice(0, 6);
}

/** Changes whenever any mention of the person is added, moved or edited. */
export function mentionsHash(rows) {
  const key = rows
    .map(
      (r) =>
        `${r.id}:${r.entry_id}:${r.sentence_start}:${r.sentence_end}:${r.valence}`,
    )
    .sort()
    .join("|");
  return contentHash(key);
}
