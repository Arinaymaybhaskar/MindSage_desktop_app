// Markdown: one .md file per entry with YAML front matter, media alongside.
//
// Read by Obsidian, Logseq, Joplin, Bear, Notion, Standard Notes and anything
// else that opens a folder of Markdown. On import it also takes what those
// tools write: front matter under several common key names, a date in the
// filename, an `# H1` as the title, and image links in either Markdown
// `![](path)` or Obsidian `![[file]]` form.

import {
  basename,
  cleanTags,
  clampMood,
  dateFromFilename,
  isAudioName,
  isImageName,
  localStamp,
  makeEntry,
  parseFrontMatter,
  slug,
  splitHeading,
  toIso,
  yamlString,
} from "../common.js";

const TITLE_KEYS = ["title", "name"];
const DATE_KEYS = [
  "date",
  "created",
  "created_at",
  "createdAt",
  "creation_date",
  "day",
];
const UPDATED_KEYS = ["updated", "modified", "updated_at", "updatedAt"];
const TAG_KEYS = ["tags", "tag", "keywords"];
const MOOD_KEYS = ["mood", "mood_score"];

const first = (data, keys) => {
  for (const k of keys)
    if (data[k] !== undefined && data[k] !== "") return data[k];
  return undefined;
};

export const markdown = {
  id: "markdown",

  detect(files) {
    return [...files.keys()].some((p) => /\.(md|markdown)$/i.test(p));
  },

  read(files) {
    const byBase = new Map();
    for (const p of files.keys()) byBase.set(basename(p).toLowerCase(), p);
    const resolve = (fromPath, ref) => {
      const clean = decodeURIComponent(ref.split(/[?#]/)[0]);
      const dir = fromPath.includes("/")
        ? fromPath.replace(/\/[^/]*$/, "/")
        : "";
      const candidates = [dir + clean, clean, clean.replace(/^\.\//, dir)];
      for (const c of candidates) if (files.has(c)) return c;
      return byBase.get(basename(clean).toLowerCase()) ?? null;
    };

    const entries = [];
    const warnings = [];
    for (const [p, bytes] of files) {
      if (!/\.(md|markdown)$/i.test(p)) continue;
      const text = new TextDecoder().decode(bytes);
      const { data, body } = parseFrontMatter(text);
      const heading = splitHeading(body);

      const createdAt =
        toIso(first(data, DATE_KEYS)) ?? dateFromFilename(p) ?? null;
      if (!createdAt) {
        warnings.push(
          `${basename(p)}: no date in front matter or filename, so it is dated today`,
        );
      }

      const media = { images: [], audio: [] };
      const refPattern =
        /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)|!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
      // Drop a leading heading when it is the title: either there is no
      // front-matter title, or the heading repeats it (as our export writes).
      const fmTitle = first(data, TITLE_KEYS);
      const headingIsTitle =
        heading.title && (!fmTitle || heading.title === String(fmTitle).trim());
      let content = (headingIsTitle ? heading.body : body).replace(
        refPattern,
        (whole, mdRef, wikiRef) => {
          const ref = mdRef ?? wikiRef;
          if (/^[a-z]+:/i.test(ref)) return whole; // a URL, leave it
          const found = resolve(p, ref);
          if (!found) return whole;
          const item = { name: basename(found), data: files.get(found) };
          if (isImageName(found)) media.images.push(item);
          else if (isAudioName(found)) media.audio.push(item);
          else return whole;
          return "";
        },
      );
      content = content.replace(/\n{3,}/g, "\n\n").trim();

      const rawTags = first(data, TAG_KEYS);
      entries.push(
        makeEntry({
          title:
            first(data, TITLE_KEYS) ??
            heading.title ??
            // In Obsidian and most vaults the filename is the note's title.
            // Our own export names untitled entries after their first words,
            // and writes no title, so for those the filename is not one.
            (data.source === "MindSage"
              ? null
              : basename(p)
                  .replace(/\.(md|markdown)$/i, "")
                  .replace(
                    /^\d{4}-\d{2}-\d{2}[ T_]?(\d{2}[:.-]?\d{2})?\s*/,
                    "",
                  ) || null),
          content,
          createdAt: createdAt ?? new Date().toISOString(),
          updatedAt: toIso(first(data, UPDATED_KEYS)),
          mood: clampMood(first(data, MOOD_KEYS)),
          tags: cleanTags(
            Array.isArray(rawTags)
              ? rawTags
              : typeof rawTags === "string"
                ? rawTags.split(/[,;]/)
                : [],
          ),
          images: media.images,
          audio: media.audio,
        }),
      );
    }
    return { entries, warnings };
  },

  write(entries) {
    const files = new Map();
    const used = new Set();
    for (const e of entries) {
      const stamp = localStamp(e.createdAt).replace(":", "");
      let name = `${stamp} ${slug(e.title || firstWords(e.content))}`;
      while (used.has(name)) name += " (2)";
      used.add(name);

      const front = ["---"];
      if (e.title) front.push(`title: ${yamlString(e.title)}`);
      front.push(`date: ${e.createdAt}`);
      if (e.updatedAt) front.push(`updated: ${e.updatedAt}`);
      if (e.mood !== null && e.mood !== undefined)
        front.push(`mood: ${e.mood}`);
      if (e.tags.length) {
        front.push("tags:");
        for (const t of e.tags) front.push(`  - ${yamlString(t)}`);
      }
      front.push("source: MindSage", "---", "");

      const body = [];
      if (e.title) body.push(`# ${e.title}`, "");
      body.push(e.content.trim());
      for (const [i, m] of [...e.images, ...e.audio].entries()) {
        const att = `attachments/${name}${i ? `-${i + 1}` : ""}-${m.name}`;
        files.set(att, m.data);
        const link = encodeURI(att);
        // An embed for audio too: Obsidian and Logseq show a player for it.
        body.push("", `![${isImageName(m.name) ? "" : m.name}](${link})`);
      }
      files.set(`${name}.md`, front.join("\n") + body.join("\n") + "\n");
    }
    return { files, single: false };
  },
};

function firstWords(text) {
  return String(text ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join(" ");
}
