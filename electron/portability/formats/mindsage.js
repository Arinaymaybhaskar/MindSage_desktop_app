// MindSage's own backup: the zip "Full backup" writes (electron/db/exportData.js),
// with data.json at the root, images/ and audio/ beside it. Import restores
// the journal entries with their tags, mood and media. Goals, chats and the
// AI-generated insights in the backup are not restored by this importer; the
// import summary says so when a backup contains them.

import { basename, cleanTags, makeEntry, toIso } from "../common.js";

function backupJson(files) {
  for (const [p, bytes] of files) {
    if (basename(p) !== "data.json") continue;
    try {
      const doc = JSON.parse(new TextDecoder().decode(bytes));
      if (doc && Array.isArray(doc.journal_entries)) return doc;
    } catch {
      // Not ours.
    }
  }
  return null;
}

export const mindsage = {
  id: "mindsage",

  detect(files) {
    return backupJson(files) !== null;
  },

  read(files) {
    const doc = backupJson(files);
    const warnings = [];
    const byBase = new Map();
    for (const p of files.keys()) byBase.set(basename(p), p);

    const tagName = new Map((doc.tags ?? []).map((t) => [t.id, t.name]));
    const tagsFor = new Map();
    for (const link of doc.journal_entry_tags ?? []) {
      const name = tagName.get(link.tag_id);
      if (!name) continue;
      if (!tagsFor.has(link.journal_entry_id))
        tagsFor.set(link.journal_entry_id, []);
      tagsFor.get(link.journal_entry_id).push(name);
    }

    const media = (key) => {
      if (!key) return [];
      const found = byBase.get(basename(key));
      if (!found) {
        warnings.push(`${basename(key)} is referenced but not in the backup`);
        return [];
      }
      return [{ name: basename(found), data: files.get(found) }];
    };

    const entries = doc.journal_entries
      .filter((e) => !e.is_deleted)
      .map((e) =>
        makeEntry({
          title: e.title || null,
          content: String(e.content ?? ""),
          createdAt: toIso(e.created_at) ?? new Date().toISOString(),
          updatedAt: toIso(e.updated_at),
          mood: e.mood_score ?? null,
          tags: cleanTags(tagsFor.get(e.id) ?? []),
          images: media(e.image_key),
          audio: media(e.audio_key),
        }),
      );

    const left = ["goals", "chats", "progress_logs"].filter(
      (k) => doc[k]?.length,
    );
    if (left.length) {
      warnings.push(
        `This backup also holds ${left.join(", ").replace("_", " ")}; only journal entries are imported`,
      );
    }
    return { entries, warnings };
  },
};
