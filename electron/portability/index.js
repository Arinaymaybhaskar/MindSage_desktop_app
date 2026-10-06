// index.js
//
// The one entry point the main process uses: open whatever the user picked,
// work out what wrote it, read it into PortableEntries; and the reverse for
// export. Pure (fflate, no electron), so the whole round trip is testable.

import { unzipSync, zipSync, strToU8 } from "fflate";
import { basename } from "./common.js";
import { mindsage } from "./formats/mindsage.js";
import { dayone } from "./formats/dayone.js";
import { journey } from "./formats/journey.js";
import { enex } from "./formats/enex.js";
import { csv } from "./formats/csv.js";
import { markdown } from "./formats/markdown.js";
import { text } from "./formats/text.js";

// Most specific first: a Day One zip also contains JSON, a MindSage backup
// also contains JSON, and Markdown and text are the catch-alls.
const READERS = [mindsage, dayone, journey, enex, csv, markdown, text];

export const EXPORT_FORMATS = {
  markdown: { writer: markdown, ext: "zip" },
  dayone: { writer: dayone, ext: "zip" },
  csv: { writer: csv, ext: "csv" },
  enex: { writer: enex, ext: "enex" },
  text: { writer: text, ext: "txt" },
};

export const FORMAT_NAMES = {
  mindsage: "MindSage backup",
  dayone: "Day One",
  journey: "Journey",
  enex: "Evernote",
  csv: "CSV",
  markdown: "Markdown",
  text: "Plain text",
};

const looksZipped = (bytes) =>
  bytes.length > 3 &&
  bytes[0] === 0x50 &&
  bytes[1] === 0x4b &&
  bytes[2] === 0x03 &&
  bytes[3] === 0x04;

/**
 * Turns what was picked into a flat map of path -> bytes. A zip is opened
 * (and a zip inside it too, which is how some apps nest media); a single
 * file stands alone. macOS metadata (__MACOSX, ._files) is dropped.
 */
export function collectFiles(inputs) {
  const files = new Map();
  const add = (p, bytes, depth = 0) => {
    if (/(^|\/)(__MACOSX\/|\._)|\.DS_Store$/.test(p)) return;
    if (depth < 2 && looksZipped(bytes)) {
      const inner = unzipSync(bytes);
      for (const [q, b] of Object.entries(inner)) {
        if (!q.endsWith("/")) add(depth ? `${p}/${q}` : q, b, depth + 1);
      }
      return;
    }
    files.set(p.replace(/\\/g, "/"), bytes);
  };
  for (const { name, data } of inputs) add(basename(name), data);
  return files;
}

/**
 * Reads entries out of whatever was picked. Returns the detected format, the
 * entries, and warnings worth showing the user.
 */
export function readAny(inputs) {
  const files = collectFiles(inputs);
  const reader = READERS.find((r) => r.detect(files));
  if (!reader) {
    return {
      format: null,
      entries: [],
      warnings: [
        "This doesn't look like a journal export MindSage can read. Supported: a MindSage backup, Day One JSON, Journey, Evernote (.enex), CSV (including Daylio), Markdown and plain text.",
      ],
    };
  }
  const { entries, warnings } = reader.read(files);
  return { format: reader.id, entries, warnings };
}

/**
 * Writes entries in one of the export formats. Returns the bytes of a single
 * file: the file itself for single-file formats, a zip otherwise.
 */
export function writeAny(format, entries, options = {}) {
  const spec = EXPORT_FORMATS[format];
  if (!spec) throw new Error(`Unknown export format: ${format}`);
  const { files, single } = spec.writer.write(entries, options);
  const toBytes = (v) => (typeof v === "string" ? strToU8(v) : v);
  if (single && files.size === 1) {
    return { bytes: toBytes([...files.values()][0]), ext: spec.ext };
  }
  const tree = {};
  for (const [p, v] of files) tree[p] = toBytes(v);
  return { bytes: zipSync(tree, { level: 6 }), ext: "zip" };
}
