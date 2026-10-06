// Plain text. Export: one readable file, oldest entry first, each under a
// dated header. Import: either that same file (split back on its headers), or
// any .txt files, one entry each, which is what Diarium, Penzu, Apple Notes
// exporters and most "export as text" buttons produce.

import {
  basename,
  dateFromFilename,
  localStamp,
  makeEntry,
  toIso,
} from "../common.js";

const RULE = "=".repeat(60);
// Our own export: a rule, "2024-01-31 08:30  Title", a rule, then the body.
const OWN_HEADER = new RegExp(
  `^${RULE}\\r?\\n(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2})(?:  (.*))?\\r?\\n${RULE}\\r?\\n`,
  "m",
);

export const text = {
  id: "text",

  detect(files) {
    return [...files.keys()].some((p) => /\.txt$/i.test(p));
  },

  read(files) {
    const entries = [];
    const warnings = [];
    for (const [p, bytes] of files) {
      if (!/\.txt$/i.test(p)) continue;
      const s = new TextDecoder().decode(bytes).replace(/^\uFEFF/, "");

      if (OWN_HEADER.test(s)) {
        const parts = s.split(new RegExp(`^${RULE}\\r?\\n`, "m")).slice(1);
        for (let i = 0; i + 1 < parts.length; i += 2) {
          const head = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2})(?:  (.*))?/.exec(
            parts[i].trim(),
          );
          if (!head) continue;
          // The export appends "Tags:" and "Mood:" lines; read them back out
          // of the body rather than leaving them in the entry's text.
          let body = parts[i + 1].trim();
          let tags = [];
          let mood = null;
          const trailer = /\n\n((?:(?:Tags|Mood): .*(?:\n|$))+)$/.exec(body);
          if (trailer) {
            for (const line of trailer[1].trim().split("\n")) {
              const t = /^Tags: (.*)$/.exec(line);
              const m = /^Mood: (\d)\/5$/.exec(line);
              if (t)
                tags = t[1]
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean);
              if (m) mood = Number(m[1]);
            }
            body = body.slice(0, trailer.index).trim();
          }
          entries.push(
            makeEntry({
              title: head[2]?.trim() || null,
              content: body,
              createdAt: toIso(head[1]) ?? new Date().toISOString(),
              tags,
              mood,
            }),
          );
        }
        continue;
      }

      const lines = s.trim().split(/\r?\n/);
      const firstLine = lines[0]?.trim() ?? "";
      const looksLikeTitle =
        lines.length > 1 &&
        firstLine.length > 0 &&
        firstLine.length <= 80 &&
        !/[.!?]$/.test(firstLine);
      const createdAt = dateFromFilename(p);
      if (!createdAt)
        warnings.push(`${basename(p)}: no date in the filename, dated today`);
      entries.push(
        makeEntry({
          title: looksLikeTitle
            ? firstLine
            : basename(p).replace(/\.txt$/i, "") || null,
          content: (looksLikeTitle ? lines.slice(1) : lines).join("\n").trim(),
          createdAt: createdAt ?? new Date().toISOString(),
        }),
      );
    }
    return { entries, warnings };
  },

  write(entries) {
    const sorted = [...entries].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
    const out = sorted.map((e) => {
      const head = `${localStamp(e.createdAt)}${e.title ? `  ${e.title.replace(/\s+/g, " ")}` : ""}`;
      const extra = [];
      if (e.tags.length) extra.push(`Tags: ${e.tags.join(", ")}`);
      if (e.mood !== null && e.mood !== undefined)
        extra.push(`Mood: ${e.mood}/5`);
      return `${RULE}\n${head}\n${RULE}\n${e.content.trim()}\n${extra.length ? `\n${extra.join("\n")}\n` : ""}`;
    });
    return { files: new Map([["MindSage.txt", out.join("\n")]]), single: true };
  },
};
