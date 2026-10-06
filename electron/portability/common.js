// common.js
//
// The shape every import format is read into and every export format is
// written from, plus the small text utilities they share. Pure: no electron,
// no better-sqlite3, no filesystem, so all of it runs under vitest.
//
// A PortableEntry:
//   {
//     title:     string | null
//     content:   string            plain text or Markdown, as the editor stores it
//     createdAt: string            ISO 8601 UTC, which is what the app stores
//     updatedAt: string | null
//     mood:      number | null     1 to 5, the editor's slider scale
//     tags:      string[]
//     images:    { name, data }[]  data is a Uint8Array; the app keeps the first
//     audio:     { name, data }[]  likewise
//   }

/** A fresh entry with every field present, so writers never test for undefined. */
export function makeEntry(fields) {
  return {
    title: null,
    content: "",
    createdAt: new Date(0).toISOString(),
    updatedAt: null,
    mood: null,
    tags: [],
    images: [],
    audio: [],
    ...fields,
  };
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i;
const AUDIO_EXT = /\.(m4a|mp3|wav|webm|ogg|aac|caf|flac)$/i;

export const isImageName = (name) => IMAGE_EXT.test(name);
export const isAudioName = (name) => AUDIO_EXT.test(name);

export function extensionOf(name) {
  const m = /\.([A-Za-z0-9]+)$/.exec(name ?? "");
  return m ? m[1].toLowerCase() : "";
}

export function basename(p) {
  return String(p ?? "")
    .split(/[\\/]/)
    .pop();
}

/** Tags trimmed, de-duplicated case-insensitively, empties dropped. */
export function cleanTags(tags) {
  const seen = new Set();
  const out = [];
  for (const raw of tags ?? []) {
    const t = String(raw).trim().replace(/^#/, "");
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out;
}

/**
 * Puts a mood from any app onto MindSage's 1 to 5 scale (the editor's slider,
 * the mood orb and the calendar all use it), or null for none. 0 means none,
 * as Quick Capture writes it. Above 5 the source is read as out of 10 or out
 * of 100, the two other scales apps use.
 */
export function clampMood(value) {
  const n = Number(value);
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    !Number.isFinite(n) ||
    n <= 0
  )
    return null;
  const onFive =
    n <= 5 ? n : n <= 10 ? n / 2 : 1 + (Math.min(n, 100) / 100) * 4;
  return Math.max(1, Math.min(5, Math.round(onFive)));
}

/**
 * Parses a date written any of the ways journaling apps write them, and
 * returns ISO 8601 UTC, or null. Numbers are epoch milliseconds, or seconds
 * when small enough to be seconds. A bare date (no time) is read as local
 * noon, so a timezone offset cannot push it onto the neighbouring day.
 */
export function toIso(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" || /^\d{9,13}$/.test(String(value))) {
    const n = Number(value);
    const ms = n < 1e11 ? n * 1000 : n;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const s = String(value).trim();
  // Evernote: 20240131T083000Z
  const enex = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s);
  if (enex) {
    const [, y, mo, d, h, mi, se] = enex;
    return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +se)).toISOString();
  }
  const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (bare) {
    const [, y, mo, d] = bare;
    return new Date(+y, +mo - 1, +d, 12, 0, 0).toISOString();
  }
  // "2024-01-31 08:30" and friends: give it a T so Date reads it as local.
  const d = new Date(/^\d{4}-\d{2}-\d{2} \d/.test(s) ? s.replace(" ", "T") : s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** A YYYY-MM-DD (optionally with a time) at the start of a filename. */
export function dateFromFilename(name) {
  const m = /(\d{4})-(\d{2})-(\d{2})(?:[ T_]?(\d{2})[:.-]?(\d{2}))?/.exec(
    basename(name),
  );
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const date = new Date(+y, +mo - 1, +d, h ? +h : 12, mi ? +mi : 0, 0);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeEntities(s) {
  return String(s).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code) => {
    if (code[0] === "#") {
      const n =
        code[1].toLowerCase() === "x"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

export function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Turns the HTML that Journey and Evernote store into the plain text with
 * light Markdown that the editor holds. Handles the tags those apps actually
 * emit; anything else is dropped to its text.
 */
export function htmlToText(html) {
  let s = String(html ?? "");
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(
    /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi,
    (_, n, t) => `\n${"#".repeat(+n)} ${t}\n`,
  );
  s = s.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**");
  s = s.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, "*$2*");
  s = s.replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");
  s = s.replace(/<li[^>]*>/gi, "\n- ");
  s = s.replace(/<\/li>/gi, "");
  s = s.replace(/<\/(p|div|ul|ol|blockquote|h[1-6])>/gi, "\n");
  s = s.replace(/<(p|div|ul|ol|blockquote)[^>]*>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  return s
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Plain text and light Markdown to the minimal HTML that ENEX wants. */
export function textToHtml(text) {
  return String(text ?? "")
    .split(/\n{2,}/)
    .map((para) => `<div>${escapeXml(para).replace(/\n/g, "<br/>")}</div>`)
    .join("");
}

/**
 * RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes, CRLF or
 * LF, and a byte-order mark. Returns an array of rows of strings.
 */
export function parseCsv(text) {
  const s = String(text).replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

export function csvField(value) {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Reads the YAML front matter Obsidian, Jekyll and most Markdown tools write:
 * scalars, quoted strings, inline lists `[a, b]` and dash lists. Not a full
 * YAML parser, deliberately; a block it cannot read is left in the body.
 */
export function parseFrontMatter(md) {
  const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(md);
  if (!m) return { data: {}, body: md };
  const data = {};
  let listKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && listKey) {
      data[listKey].push(unquote(item[1]));
      continue;
    }
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, raw] = kv;
    const v = raw.trim();
    if (v === "") {
      data[key] = [];
      listKey = key;
    } else if (v.startsWith("[") && v.endsWith("]")) {
      data[key] = v
        .slice(1, -1)
        .split(",")
        .map((x) => unquote(x.trim()))
        .filter(Boolean);
      listKey = null;
    } else {
      data[key] = unquote(v);
      listKey = null;
    }
  }
  return { data, body: md.slice(m[0].length) };
}

function unquote(v) {
  const s = String(v).trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1).replace(/\\"/g, '"');
  }
  return s;
}

export function yamlString(v) {
  const s = String(v);
  return /^[\w .,!?()'-]*$/.test(s) && !/^\s|\s$/.test(s) && s !== ""
    ? s
    : JSON.stringify(s);
}

/** A filename-safe slug of at most `max` characters. */
export function slug(s, max = 60) {
  return (
    String(s ?? "")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, max)
      .trim() || "Untitled"
  );
}

/**
 * Splits "# Title\n\nbody" into its parts, the way Day One and Markdown
 * exports put the title in the text. A first line is only a title when it is
 * a heading, so a diary that opens with a sentence keeps it.
 */
export function splitHeading(text) {
  const m = /^\s*#{1,2}\s+(.+?)\s*(?:\r?\n|$)/.exec(String(text ?? ""));
  if (!m) return { title: null, body: String(text ?? "").trim() };
  return { title: m[1].trim(), body: String(text).slice(m[0].length).trim() };
}

/** Local "YYYY-MM-DD HH:mm" for human-facing exports. */
export function localStamp(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
