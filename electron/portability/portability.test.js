import { describe, it, expect } from "vitest";
import { strToU8, zipSync } from "fflate";
import { readAny, writeAny } from "./index.js";
import {
  htmlToText,
  parseCsv,
  parseFrontMatter,
  toIso,
  dateFromFilename,
} from "./common.js";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const WAV = new Uint8Array([0x52, 0x49, 0x46, 0x46, 9, 9]);

const ENTRIES = [
  {
    title: "Fastest 10K yet",
    content:
      'Canal loop before work.\n\nPast the bridge my legs went light, "quietly", and that, was it.',
    createdAt: "2026-09-27T06:40:00.000Z",
    updatedAt: "2026-09-27T07:00:00.000Z",
    mood: 82,
    tags: ["running", "proud"],
    images: [{ name: "canal.png", data: PNG }],
    audio: [{ name: "note.wav", data: WAV }],
  },
  {
    title: null,
    content: "A short one with no title, a comma, and a line\nbreak.",
    createdAt: "2026-10-01T19:15:00.000Z",
    updatedAt: null,
    mood: null,
    tags: [],
    images: [],
    audio: [],
  },
];

const file = (name, content) => ({
  name,
  data: typeof content === "string" ? strToU8(content) : content,
});

const roundTrip = (format) => {
  const { bytes, ext } = writeAny(format, ENTRIES, {
    timeZone: "Europe/London",
  });
  return { ...readAny([file(`export.${ext}`, bytes)]), ext };
};

const byDate = (entries) =>
  [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

describe("round trips", () => {
  it("Markdown keeps title, date, mood, tags and media", () => {
    const { format, entries, warnings } = roundTrip("markdown");
    expect(format).toBe("markdown");
    expect(warnings).toEqual([]);
    const [a, b] = byDate(entries);
    expect(a.title).toBe("Fastest 10K yet");
    expect(a.content).toBe(ENTRIES[0].content);
    expect(a.createdAt).toBe(ENTRIES[0].createdAt);
    expect(a.mood).toBe(82);
    expect(a.tags).toEqual(["running", "proud"]);
    expect(a.images[0].data).toEqual(PNG);
    expect(a.audio[0].data).toEqual(WAV);
    expect(b.content).toBe(ENTRIES[1].content);
    // Untitled stays untitled, though its file is named after its first words.
    expect(b.title).toBeNull();
  });

  it("Day One keeps title, text, dates, tags and photos", () => {
    const { format, entries } = roundTrip("dayone");
    expect(format).toBe("dayone");
    const [a, b] = byDate(entries);
    expect(a.title).toBe("Fastest 10K yet");
    expect(a.content).toBe(ENTRIES[0].content);
    expect(a.createdAt).toBe(ENTRIES[0].createdAt);
    expect(a.tags).toEqual(["running", "proud"]);
    expect(a.images[0].data).toEqual(PNG);
    expect(b.title).toBeNull();
  });

  it("CSV keeps title, text, mood and tags in one file", () => {
    const { format, entries, ext } = roundTrip("csv");
    expect(ext).toBe("csv");
    expect(format).toBe("csv");
    const [a, b] = byDate(entries);
    expect(a.title).toBe("Fastest 10K yet");
    expect(a.content).toBe(ENTRIES[0].content);
    expect(a.mood).toBe(82);
    expect(a.tags).toEqual(["running", "proud"]);
    expect(b.content).toBe(ENTRIES[1].content);
  });

  it("Evernote keeps title, text, dates, tags and media", () => {
    const { format, entries, ext } = roundTrip("enex");
    expect(ext).toBe("enex");
    expect(format).toBe("enex");
    const [a] = byDate(entries);
    expect(a.title).toBe("Fastest 10K yet");
    expect(a.content).toBe(ENTRIES[0].content);
    expect(a.createdAt).toBe("2026-09-27T06:40:00.000Z");
    expect(a.tags).toEqual(["running", "proud"]);
    expect(a.images[0].data).toEqual(PNG);
    expect(a.audio[0].data).toEqual(WAV);
  });

  it("plain text keeps title, text, tags and mood", () => {
    const { format, entries } = roundTrip("text");
    expect(format).toBe("text");
    const [a, b] = byDate(entries);
    expect(a.title).toBe("Fastest 10K yet");
    expect(a.content).toBe(ENTRIES[0].content);
    expect(a.tags).toEqual(["running", "proud"]);
    expect(a.mood).toBe(82);
    expect(b.title).toBeNull();
    // Minutes survive; the text format does not carry seconds.
    expect(a.createdAt).toBe(ENTRIES[0].createdAt);
  });
});

describe("other apps' exports", () => {
  it("reads a Daylio CSV, mapping its moods and activities", () => {
    const daylio = [
      "full_date,date,weekday,time,mood,activities,note_title,note",
      '2024-03-02,March 2,Saturday,21:05,rad,friends | cooking,Dinner,"Made pasta, finally."',
      "2024-03-01,March 1,Friday,08:10,meh,work,,Long day",
    ].join("\n");
    const { format, entries } = readAny([file("daylio_export.csv", daylio)]);
    expect(format).toBe("csv");
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      title: "Dinner",
      content: "Made pasta, finally.",
      mood: 100,
      tags: ["friends", "cooking"],
    });
    expect(entries[1]).toMatchObject({
      title: null,
      content: "Long day",
      mood: 50,
    });
    expect(new Date(entries[0].createdAt).getHours()).toBe(21);
  });

  it("reads a Journey zip: HTML text, epoch dates, 1-5 mood, photos", () => {
    const entry = {
      mood: 5,
      date_modified: 1571425361000,
      tags: ["bike"],
      type: "html",
      date_journal: 1571386059000,
      photos: ["1571425138176-abc.jpeg"],
      timezone: "Europe/London",
      text: '<p dir="auto">Rode my new bike for the first time!&nbsp;</p>\n<p dir="auto"></p>\n<p dir="auto">It looks <em>very dark grey</em>!</p>',
      label: "",
    };
    const zip = zipSync({
      "1571425138176-abc.json": strToU8(JSON.stringify(entry)),
      "1571425138176-abc.jpeg": PNG,
    });
    const { format, entries } = readAny([file("journey-export.zip", zip)]);
    expect(format).toBe("journey");
    expect(entries[0]).toMatchObject({
      content:
        "Rode my new bike for the first time!\n\nIt looks *very dark grey*!",
      createdAt: "2019-10-18T08:07:39.000Z",
      mood: 100,
      tags: ["bike"],
    });
    expect(entries[0].images[0].data).toEqual(PNG);
  });

  it("reads a Day One export with photos referenced by moment", () => {
    const journal = {
      metadata: { version: "1.0" },
      entries: [
        {
          creationDate: "2019-10-18T08:07:39Z",
          text: "Rode my new bike\\! \n\n![](dayone-moment:\\/\\/E26AF654)",
          tags: ["bike"],
          photos: [{ identifier: "E26AF654", md5: "d41d8cd98f", type: "jpeg" }],
        },
      ],
    };
    const zip = zipSync({
      "Journal.json": strToU8(
        JSON.stringify(journal).replace(/\\\\\//g, "\\/"),
      ),
      "photos/d41d8cd98f.jpeg": PNG,
    });
    const { format, entries, warnings } = readAny([file("Export.zip", zip)]);
    expect(format).toBe("dayone");
    expect(warnings).toEqual([]);
    expect(entries[0].content).toBe("Rode my new bike!");
    expect(entries[0].images[0].data).toEqual(PNG);
  });

  it("reads Obsidian Markdown: front matter aliases, wiki images, filename dates", () => {
    const zip = zipSync({
      "Journal/2024-05-04.md": strToU8(
        "---\ncreated: 2024-05-04T09:30:00Z\ntags: [garden, spring]\n---\n# Tomatoes\n\nPlanted them out.\n\n![[seedlings.png]]\n",
      ),
      "Journal/attachments/seedlings.png": PNG,
      "Journal/2024-05-05 untitled thoughts.md": strToU8("Just a line."),
    });
    const { format, entries } = readAny([file("vault.zip", zip)]);
    expect(format).toBe("markdown");
    const [a, b] = byDate(entries);
    expect(a).toMatchObject({
      title: "Tomatoes",
      content: "Planted them out.",
      createdAt: "2024-05-04T09:30:00.000Z",
      tags: ["garden", "spring"],
    });
    expect(a.images[0].data).toEqual(PNG);
    expect(b.title).toBe("untitled thoughts");
    expect(new Date(b.createdAt).getDate()).toBe(5);
  });

  it("reads loose .txt files as one entry each", () => {
    const { format, entries } = readAny([
      file("2023-12-31 Year end.txt", "Year end\nA good one, all told."),
    ]);
    expect(format).toBe("text");
    expect(entries[0]).toMatchObject({
      title: "Year end",
      content: "A good one, all told.",
    });
    expect(new Date(entries[0].createdAt).getFullYear()).toBe(2023);
  });

  it("restores a MindSage backup's entries, tags and media", () => {
    const data = {
      journal_entries: [
        {
          id: 7,
          title: "Kept",
          content: "Body",
          created_at: "2026-01-02T03:04:05.000Z",
          mood_score: 60,
          image_key: "images/1-a.png",
          is_deleted: 0,
        },
        {
          id: 8,
          title: "Gone",
          content: "x",
          created_at: "2026-01-03T00:00:00.000Z",
          is_deleted: 1,
        },
      ],
      tags: [{ id: 1, name: "calm" }],
      journal_entry_tags: [{ journal_entry_id: 7, tag_id: 1 }],
      goals: [{ id: 1 }],
    };
    const zip = zipSync({
      "data.json": strToU8(JSON.stringify(data)),
      "images/1-a.png": PNG,
    });
    const { format, entries, warnings } = readAny([
      file("MindSage_Export.zip", zip),
    ]);
    expect(format).toBe("mindsage");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      title: "Kept",
      mood: 60,
      tags: ["calm"],
    });
    expect(entries[0].images[0].data).toEqual(PNG);
    expect(warnings.join(" ")).toMatch(/goals/);
  });

  it("says so when it cannot tell what something is", () => {
    const { format, entries, warnings } = readAny([file("photo.png", PNG)]);
    expect(format).toBeNull();
    expect(entries).toEqual([]);
    expect(warnings[0]).toMatch(/doesn't look like a journal export/);
  });
});

describe("helpers", () => {
  it("parses CSV quoting, embedded newlines and a BOM", () => {
    expect(parseCsv('﻿a,b\r\n"x, ""y""","line1\nline2"\r\n')).toEqual([
      ["a", "b"],
      ['x, "y"', "line1\nline2"],
    ]);
  });

  it("reads front matter scalars, inline lists and dash lists", () => {
    const { data, body } = parseFrontMatter(
      '---\ntitle: "Hello: world"\ntags:\n  - a\n  - b\nmood: 40\n---\nBody',
    );
    expect(data).toEqual({
      title: "Hello: world",
      tags: ["a", "b"],
      mood: "40",
    });
    expect(body).toBe("Body");
  });

  it("turns app HTML into readable text", () => {
    expect(
      htmlToText(
        "<div>One<br/>Two</div><ul><li>a</li><li>b</li></ul><p>A &amp; B</p>",
      ),
    ).toBe("One\nTwo\n\n- a\n- b\n\nA & B");
  });

  it("reads the date shapes apps write", () => {
    expect(toIso("20240131T083000Z")).toBe("2024-01-31T08:30:00.000Z");
    expect(toIso(1571386059000)).toBe("2019-10-18T08:07:39.000Z");
    expect(toIso(1571386059)).toBe("2019-10-18T08:07:39.000Z");
    expect(new Date(toIso("2024-02-29")).getDate()).toBe(29);
    expect(toIso("not a date")).toBeNull();
    expect(new Date(dateFromFilename("2024-02-29 Leap.md")).getMonth()).toBe(1);
  });
});
