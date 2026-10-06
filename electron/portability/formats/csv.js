// CSV: one row per entry. Opens in any spreadsheet, imports into Notion as a
// database, and is what Daylio exports.
//
// Import reads Daylio's fixed columns (full_date, date, weekday, time, mood,
// activities, note_title, note) and otherwise looks for columns by the names
// apps commonly use: a date, a title, the text, tags and a mood. Media cannot
// travel in a CSV; the export screen says so.

import {
  cleanTags,
  clampMood,
  csvField,
  localStamp,
  makeEntry,
  parseCsv,
  toIso,
} from "../common.js";

// Daylio's five default moods. Custom moods fall back to their position.
const DAYLIO_MOODS = { rad: 100, good: 75, meh: 50, bad: 25, awful: 0 };

const norm = (h) =>
  h
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
const pick = (headers, names) => {
  for (const n of names) {
    const i = headers.indexOf(n);
    if (i !== -1) return i;
  }
  return -1;
};

export const csv = {
  id: "csv",

  detect(files) {
    return [...files.keys()].some((p) => /\.csv$/i.test(p));
  },

  read(files) {
    const entries = [];
    const warnings = [];
    for (const [p, bytes] of files) {
      if (!/\.csv$/i.test(p)) continue;
      const rows = parseCsv(new TextDecoder().decode(bytes));
      if (rows.length < 2) continue;
      const headers = rows[0].map(norm);

      const daylio = ["full_date", "mood", "activities", "note"].every((h) =>
        headers.includes(h),
      );
      const col = daylio
        ? {
            date: headers.indexOf("full_date"),
            time: headers.indexOf("time"),
            title: headers.indexOf("note_title"),
            text: headers.indexOf("note"),
            tags: headers.indexOf("activities"),
            mood: headers.indexOf("mood"),
          }
        : {
            date: pick(headers, [
              "date",
              "created_at",
              "created",
              "datetime",
              "timestamp",
              "full_date",
              "creation_date",
              "entry_date",
            ]),
            time: pick(headers, ["time"]),
            title: pick(headers, ["title", "subject", "note_title", "heading"]),
            text: pick(headers, [
              "content",
              "text",
              "body",
              "entry",
              "note",
              "notes",
              "journal",
              "description",
            ]),
            tags: pick(headers, [
              "tags",
              "tag",
              "activities",
              "labels",
              "keywords",
            ]),
            mood: pick(headers, ["mood", "mood_score", "rating"]),
          };

      if (col.text === -1 && col.title === -1) {
        warnings.push(
          `${p}: no text or title column found, so nothing was read from it`,
        );
        continue;
      }

      for (const [n, r] of rows.slice(1).entries()) {
        const get = (i) => (i === -1 ? "" : (r[i] ?? "").trim());
        const dateRaw = [get(col.date), get(col.time)]
          .filter(Boolean)
          .join(" ");
        const createdAt = toIso(dateRaw);
        if (!createdAt)
          warnings.push(
            `${p} row ${n + 2}: unreadable date "${dateRaw}", dated today`,
          );

        let mood = null;
        const moodRaw = get(col.mood);
        if (moodRaw) {
          const key = moodRaw.toLowerCase();
          if (key in DAYLIO_MOODS) mood = DAYLIO_MOODS[key];
          else if (/^\d+(\.\d+)?$/.test(moodRaw)) {
            const v = Number(moodRaw);
            // 1 to 5 and 1 to 10 scales are common; 0 to 100 is ours.
            mood = clampMood(
              v <= 5 ? ((v - 1) / 4) * 100 : v <= 10 ? v * 10 : v,
            );
          }
        }

        const text = get(col.text);
        const title = get(col.title) || null;
        if (!text && !title) continue;
        entries.push(
          makeEntry({
            title,
            content: text,
            createdAt: createdAt ?? new Date().toISOString(),
            mood,
            tags: cleanTags(get(col.tags).split(daylio ? "|" : /[|,;]/)),
          }),
        );
      }
    }
    return { entries, warnings };
  },

  write(entries) {
    const lines = [
      [
        "date",
        "time",
        "title",
        "content",
        "mood",
        "tags",
        "created_at_utc",
      ].join(","),
    ];
    for (const e of entries) {
      const [day, time] = localStamp(e.createdAt).split(" ");
      lines.push(
        [
          day,
          time,
          e.title ?? "",
          e.content,
          e.mood ?? "",
          e.tags.join("|"),
          e.createdAt,
        ]
          .map(csvField)
          .join(","),
      );
    }
    // A byte-order mark so Excel opens UTF-8 text without mangling it.
    return {
      files: new Map([
        ["MindSage.csv", "\uFEFF" + lines.join("\r\n") + "\r\n"],
      ]),
      single: true,
    };
  },
};
