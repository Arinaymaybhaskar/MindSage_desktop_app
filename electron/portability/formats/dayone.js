// Day One JSON: a zip holding <Journal>.json and photos/<md5>.<type>.
//
// The format Day One imports on every platform (Mac, iOS, Android, Windows,
// web), and the one Journey and several others import as "Day One". Photos
// are placed in the text as `![](dayone-moment://<identifier>)` and matched to
// files through the md5 in their metadata. Field names follow Day One's own
// export: see https://pkg.go.dev/github.com/kwo/dayone2md and the sample in
// https://github.com/alxhslm/journey2dayone.

import { createHash, randomUUID } from "node:crypto";
import {
  basename,
  cleanTags,
  extensionOf,
  makeEntry,
  splitHeading,
  toIso,
} from "../common.js";

const MOMENT = /!\[[^\]]*\]\(dayone-moment:\/*([A-Za-z0-9-]+)\)/g;
const uuid = () => randomUUID().replace(/-/g, "").toUpperCase();

function journalJson(files) {
  for (const [p, bytes] of files) {
    if (!/\.json$/i.test(p)) continue;
    try {
      const doc = JSON.parse(new TextDecoder().decode(bytes));
      if (
        doc &&
        Array.isArray(doc.entries) &&
        doc.entries.some((e) => "creationDate" in e)
      ) {
        return { path: p, doc };
      }
    } catch {
      // Not JSON we can read; keep looking.
    }
  }
  return null;
}

export const dayone = {
  id: "dayone",

  detect(files) {
    return journalJson(files) !== null;
  },

  read(files) {
    const found = journalJson(files);
    const warnings = [];
    const byStem = new Map();
    for (const p of files.keys()) {
      byStem.set(
        basename(p)
          .replace(/\.[^.]+$/, "")
          .toLowerCase(),
        p,
      );
    }

    const entries = found.doc.entries.map((e) => {
      const attach = (list, kind) =>
        (list ?? [])
          .slice()
          .sort((a, b) => (a.orderInEntry ?? 0) - (b.orderInEntry ?? 0))
          .map((m) => {
            const p = byStem.get(String(m.md5 ?? "").toLowerCase());
            if (!p) {
              warnings.push(
                `A ${kind} in the entry of ${e.creationDate} is missing from the archive`,
              );
              return null;
            }
            return { name: basename(p), data: files.get(p) };
          })
          .filter(Boolean);

      const text = String(e.text ?? "")
        .replace(MOMENT, "")
        .replace(/\\([.!#*_-])/g, "$1");
      const { title, body } = splitHeading(text);
      return makeEntry({
        title,
        content: body.replace(/\n{3,}/g, "\n\n").trim(),
        createdAt: toIso(e.creationDate) ?? new Date().toISOString(),
        updatedAt: toIso(e.modifiedDate),
        tags: cleanTags(e.tags),
        images: attach(e.photos, "photo"),
        audio: attach(e.audios, "recording"),
      });
    });
    return { entries, warnings };
  },

  write(entries, { timeZone = "UTC" } = {}) {
    const files = new Map();
    const out = entries.map((e) => {
      const photos = [];
      const moments = [];
      for (const [i, m] of e.images.entries()) {
        const md5 = createHash("md5").update(m.data).digest("hex");
        const type =
          extensionOf(m.name) === "jpg"
            ? "jpeg"
            : extensionOf(m.name) || "jpeg";
        const identifier = uuid();
        files.set(`photos/${md5}.${type}`, m.data);
        photos.push({
          identifier,
          md5,
          type,
          orderInEntry: i,
          isSketch: false,
        });
        moments.push(`![](dayone-moment://${identifier})`);
      }
      // Voice notes are left out on purpose: Day One's audio metadata is not
      // documented anywhere we could verify, and a guess it rejects would fail
      // the whole import. The export screen says so.
      const text = [
        e.title ? `# ${e.title}` : null,
        e.content.trim(),
        moments.join("\n"),
      ]
        .filter(Boolean)
        .join("\n\n");
      return {
        uuid: uuid(),
        creationDate: e.createdAt.replace(/\.\d{3}Z$/, "Z"),
        modifiedDate: (e.updatedAt ?? e.createdAt).replace(/\.\d{3}Z$/, "Z"),
        timeZone,
        starred: false,
        text,
        ...(e.tags.length ? { tags: e.tags } : {}),
        ...(photos.length ? { photos } : {}),
      };
    });
    files.set(
      "MindSage.json",
      JSON.stringify({ metadata: { version: "1.0" }, entries: out }, null, 2),
    );
    return { files, single: false };
  },
};
