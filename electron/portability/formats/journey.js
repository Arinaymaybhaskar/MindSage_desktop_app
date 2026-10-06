// Journey (journey.cloud): a zip of one <id>.json per entry, photos beside
// them. Import only: Journey itself imports Day One, so the Day One export is
// the way back. Fields as Journey writes them, from a real export in
// https://github.com/alxhslm/journey2dayone: `date_journal` and
// `date_modified` in epoch milliseconds, `text` in HTML (or Markdown when
// `type` says so), `mood` on Journey's 1 to 5 scale, `photos` as filenames.

import {
  basename,
  cleanTags,
  htmlToText,
  makeEntry,
  toIso,
} from "../common.js";

function readJson(bytes) {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

const isJourneyEntry = (o) =>
  o && typeof o === "object" && "date_journal" in o && "text" in o;

export const journey = {
  id: "journey",

  detect(files) {
    for (const [p, bytes] of files) {
      if (/\.json$/i.test(p) && isJourneyEntry(readJson(bytes))) return true;
    }
    return false;
  },

  read(files) {
    const byBase = new Map();
    for (const p of files.keys()) byBase.set(basename(p), p);
    const entries = [];
    const warnings = [];

    for (const [p, bytes] of files) {
      if (!/\.json$/i.test(p)) continue;
      const j = readJson(bytes);
      if (!isJourneyEntry(j)) continue;

      const images = [];
      for (const name of j.photos ?? []) {
        const found = byBase.get(basename(name));
        if (found)
          images.push({ name: basename(found), data: files.get(found) });
        else warnings.push(`Photo ${name} is missing from the archive`);
      }
      const text =
        j.type === "markdown"
          ? String(j.text ?? "").trim()
          : htmlToText(j.text);
      const mood = Number(j.mood);

      entries.push(
        makeEntry({
          title: j.label || null,
          content: text,
          createdAt: toIso(Number(j.date_journal)) ?? new Date().toISOString(),
          updatedAt: toIso(Number(j.date_modified)),
          // Journey: 1 (worst) to 5 (best); 0 or missing means unset.
          mood:
            mood >= 1 && mood <= 5 ? Math.round(((mood - 1) / 4) * 100) : null,
          tags: cleanTags(j.tags),
          images,
        }),
      );
    }
    return { entries, warnings };
  },
};
