// Evernote ENEX: one XML file, notes with their attachments inline in base64.
// Imported by Evernote, Joplin, UpNote and Notesnook, and exported by Evernote
// and several note apps on the way out.

import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import {
  cleanTags,
  escapeXml,
  extensionOf,
  htmlToText,
  isAudioName,
  isImageName,
  makeEntry,
  textToHtml,
  toIso,
} from "../common.js";

const MIME = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  wav: "audio/wav",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  webm: "audio/webm",
  ogg: "audio/ogg",
};
const EXT_FOR_MIME = Object.fromEntries(
  Object.entries(MIME).map(([ext, mime]) => [mime, ext]),
);

const asArray = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const enexDate = (iso) =>
  new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

export const enex = {
  id: "enex",

  detect(files) {
    return [...files.keys()].some((p) => /\.enex$/i.test(p));
  },

  read(files) {
    const parser = new XMLParser({
      ignoreAttributes: false,
      textNodeName: "#text",
      // Note bodies are ENML wrapped in CDATA; keep them as strings.
      cdataPropName: false,
      parseTagValue: false,
    });
    const entries = [];
    const warnings = [];

    for (const [p, bytes] of files) {
      if (!/\.enex$/i.test(p)) continue;
      const doc = parser.parse(new TextDecoder().decode(bytes));
      for (const note of asArray(doc?.["en-export"]?.note)) {
        const images = [];
        const audio = [];
        for (const r of asArray(note.resource)) {
          const raw = typeof r.data === "object" ? r.data["#text"] : r.data;
          if (!raw) continue;
          const data = Uint8Array.from(
            Buffer.from(String(raw).replace(/\s+/g, ""), "base64"),
          );
          const mime = String(r.mime ?? "");
          const name =
            r["resource-attributes"]?.["file-name"] ??
            `attachment.${EXT_FOR_MIME[mime] ?? "bin"}`;
          if (mime.startsWith("image/") || isImageName(name))
            images.push({ name, data });
          else if (mime.startsWith("audio/") || isAudioName(name))
            audio.push({ name, data });
        }
        const content = htmlToText(
          String(note.content ?? "")
            .replace(/<\?xml[^>]*\?>/, "")
            .replace(/<!DOCTYPE[^>]*>/, "")
            .replace(/<en-media[^>]*\/?>(<\/en-media>)?/g, ""),
        );
        const created = toIso(note.created);
        if (!created)
          warnings.push(
            `"${note.title ?? "untitled"}" has no creation date, dated today`,
          );
        entries.push(
          makeEntry({
            title: note.title ? String(note.title) : null,
            content,
            createdAt: created ?? new Date().toISOString(),
            updatedAt: toIso(note.updated),
            tags: cleanTags(asArray(note.tag).map(String)),
            images,
            audio,
          }),
        );
      }
    }
    return { entries, warnings };
  },

  write(entries) {
    const notes = entries.map((e) => {
      const media = [...e.images, ...e.audio];
      const resources = [];
      const refs = [];
      for (const m of media) {
        const mime = MIME[extensionOf(m.name)] ?? "application/octet-stream";
        const hash = createHash("md5").update(m.data).digest("hex");
        refs.push(`<en-media type="${mime}" hash="${hash}"/>`);
        resources.push(
          `<resource><data encoding="base64">${Buffer.from(m.data).toString("base64")}</data>` +
            `<mime>${mime}</mime><resource-attributes><file-name>${escapeXml(m.name)}</file-name></resource-attributes></resource>`,
        );
      }
      const enml =
        '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">' +
        `<en-note>${textToHtml(e.content)}${refs.map((r) => `<div>${r}</div>`).join("")}</en-note>`;
      return [
        "<note>",
        `<title>${escapeXml(e.title || e.content.trim().split("\n")[0].slice(0, 80) || "Untitled")}</title>`,
        `<content><![CDATA[${enml.replace(/]]>/g, "]]]]><![CDATA[>")}]]></content>`,
        `<created>${enexDate(e.createdAt)}</created>`,
        `<updated>${enexDate(e.updatedAt ?? e.createdAt)}</updated>`,
        ...e.tags.map((t) => `<tag>${escapeXml(t)}</tag>`),
        ...resources,
        "</note>",
      ].join("");
    });
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<!DOCTYPE en-export SYSTEM "http://xml.evernote.com/pub/evernote-export3.dtd">\n' +
      `<en-export export-date="${enexDate(new Date().toISOString())}" application="MindSage" version="1.0">\n` +
      notes.join("\n") +
      "\n</en-export>\n";
    return { files: new Map([["MindSage.enex", xml]]), single: true };
  },
};
