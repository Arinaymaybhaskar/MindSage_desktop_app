// portability.js
//
// Export the journal in formats other apps read, and import what other apps
// export. The format work is pure and lives in electron/portability/; this
// module is the part that touches the database, the filesystem, dialogs and
// the session.
//
// Import is two steps so nothing lands in the journal unseen: data:import-pick
// reads and previews (format, count, date range, duplicates, warnings), and
// data:import-commit writes. The last committed import can be undone.

import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, dialog } from "electron";
import localDB from "../db/index.js";
import { db } from "../db/connection.js";
import { exportEverything } from "../db/exportData.js";
import { currentUserId } from "../session.js";
import {
  EXPORT_FORMATS,
  FORMAT_NAMES,
  readAny,
  writeAny,
} from "../portability/index.js";
import { basename } from "../portability/common.js";

const requireUser = () => {
  const id = currentUserId();
  if (!id) throw new Error("Not signed in");
  return id;
};

const DEFAULT_NAMES = {
  mindsage: "MindSage backup",
  markdown: "MindSage Markdown",
  dayone: "MindSage for Day One",
  csv: "MindSage",
  enex: "MindSage",
  text: "MindSage",
};

const EXT = {
  mindsage: "zip",
  ...Object.fromEntries(
    Object.entries(EXPORT_FORMATS).map(([k, v]) => [k, v.ext]),
  ),
};

/** The user's entries as PortableEntries, media read from disk. */
function loadEntries(userId) {
  const rows = db
    .prepare(
      `SELECT j.*, (SELECT GROUP_CONCAT(t.name, char(31))
                      FROM journal_entry_tags jt JOIN tags t ON t.id = jt.tag_id
                     WHERE jt.journal_entry_id = j.id) AS tag_list
         FROM journal_entries j
        WHERE j.user_id = ? AND j.is_deleted = 0
        ORDER BY j.created_at`,
    )
    .all(userId);
  let missingMedia = 0;
  const media = (key) => {
    if (!key) return [];
    try {
      return [{ name: basename(key), data: fs.readFileSync(key) }];
    } catch {
      missingMedia++;
      return [];
    }
  };
  const entries = rows.map((r) => ({
    title: r.title || null,
    content: r.content ?? "",
    createdAt: r.created_at,
    updatedAt: r.updated_at || null,
    // 1 to 5; 0 is how Quick Capture writes "none".
    mood: r.mood_score || null,
    tags: r.tag_list ? r.tag_list.split("\u001f") : [],
    images: media(r.image_key),
    audio: media(r.audio_key),
  }));
  return { entries, missingMedia };
}

export async function handlePickExportPath(event, format) {
  const win = BrowserWindow.fromWebContents(event.sender);
  const ext = EXT[format] ?? "zip";
  const stamp = new Date().toISOString().slice(0, 10);
  return dialog.showSaveDialog(win, {
    title: "Export your journal",
    defaultPath: path.join(
      app.getPath("documents"),
      `${DEFAULT_NAMES[format] ?? "MindSage"} ${stamp}.${ext}`,
    ),
    buttonLabel: "Export",
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  });
}

export async function handleExportJournal(event, { format, destinationPath }) {
  const userId = requireUser();
  if (!destinationPath) throw new Error("No destination chosen");
  if (format === "mindsage") {
    await exportEverything(userId, destinationPath);
    return { success: true };
  }
  const { entries, missingMedia } = loadEntries(userId);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { bytes } = writeAny(format, entries, { timeZone });
  fs.writeFileSync(destinationPath, bytes);
  return { success: true, count: entries.length, missingMedia };
}

// ------------------------------------------------------------------ import --

let pending = null; // { userId, format, entries, duplicates }
let lastImport = null; // { userId, ids, at }

const dedupeKey = (createdAt, content, title) =>
  `${String(createdAt).slice(0, 16)}|${String(content || title || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200)}`;

export async function handlePickImport(event) {
  requireUser();
  const win = BrowserWindow.fromWebContents(event.sender);
  const picked = await dialog.showOpenDialog(win, {
    title: "Import a journal",
    buttonLabel: "Read",
    properties: ["openFile", "multiSelections"],
    filters: [
      {
        name: "Journal exports",
        extensions: ["zip", "json", "csv", "md", "markdown", "txt", "enex"],
      },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (picked.canceled || !picked.filePaths.length) return { canceled: true };
  return previewImport(picked.filePaths);
}

// Size cap per dropped or picked file: a journal export larger than this is
// almost certainly the wrong file, and reading it would stall the app.
const MAX_IMPORT_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * Files dropped onto the Import panel. The renderer passes the paths of what
 * the user dropped; they are read here, parsed as journal exports, and only
 * the preview goes back, never the files' contents.
 */
export async function handleReadImport(event, paths) {
  requireUser();
  if (
    !Array.isArray(paths) ||
    !paths.length ||
    !paths.every((p) => typeof p === "string")
  ) {
    throw new Error("Nothing to read");
  }
  for (const p of paths) {
    const st = fs.statSync(p);
    if (!st.isFile())
      throw new Error(
        `${path.basename(p)} is a folder; zip it or drop the files inside`,
      );
    if (st.size > MAX_IMPORT_BYTES)
      throw new Error(
        `${path.basename(p)} is too large to be a journal export`,
      );
  }
  return previewImport(paths);
}

function previewImport(filePaths) {
  const userId = requireUser();
  const inputs = filePaths.map((p) => ({
    name: path.basename(p),
    data: fs.readFileSync(p),
  }));
  const { format, entries, warnings } = readAny(inputs);

  const existing = new Set(
    db
      .prepare(
        "SELECT created_at, content, title FROM journal_entries WHERE user_id = ? AND is_deleted = 0",
      )
      .all(userId)
      .map((r) => dedupeKey(r.created_at, r.content, r.title)),
  );
  const fresh = [];
  let duplicates = 0;
  for (const e of entries) {
    const key = dedupeKey(e.createdAt, e.content, e.title);
    if (existing.has(key)) duplicates++;
    else {
      existing.add(key);
      fresh.push(e);
    }
  }
  pending = { userId, format, entries: fresh };

  const dates = fresh.map((e) => e.createdAt).sort();
  return {
    canceled: false,
    files: filePaths.map((p) => path.basename(p)),
    format,
    formatName: format ? FORMAT_NAMES[format] : null,
    total: entries.length,
    toImport: fresh.length,
    duplicates,
    from: dates[0] ?? null,
    to: dates.at(-1) ?? null,
    withPhotos: fresh.filter((e) => e.images.length).length,
    withAudio: fresh.filter((e) => e.audio.length).length,
    // The app keeps one photo and one recording per entry; say what won't fit.
    extraMedia: fresh.reduce(
      (n, e) =>
        n + Math.max(0, e.images.length - 1) + Math.max(0, e.audio.length - 1),
      0,
    ),
    warnings: warnings.slice(0, 20),
    moreWarnings: Math.max(0, warnings.length - 20),
  };
}

export async function handleCommitImport() {
  const userId = requireUser();
  if (!pending || pending.userId !== userId)
    throw new Error("Nothing to import; pick a file first");
  const { entries } = pending;
  pending = null;

  const mediaRoot = path.join(app.getPath("userData"), "media", "journals");
  const saveMedia = (journalId, item) => {
    const dir = path.join(mediaRoot, String(journalId));
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(
      dir,
      `${Date.now()}-${item.name.replace(/[^\w.-]/g, "_")}`,
    );
    fs.writeFileSync(dest, item.data);
    return dest;
  };

  const ids = [];
  const fixUp = db.prepare(
    "UPDATE journal_entries SET mood_score = ?, updated_at = ? WHERE id = ?",
  );
  const run = db.transaction(() => {
    for (const e of entries) {
      const created = localDB.createJournalEntry(userId, {
        title: e.title,
        content: e.content,
        mood_score: e.mood,
        mood_tags: e.tags,
        created_at: e.createdAt,
      });
      // createJournalEntry reads a mood of 0 as "none" and stamps updated_at
      // now; keep what the source said.
      fixUp.run(e.mood, e.updatedAt ?? e.createdAt, created.id);
      if (e.images[0])
        localDB.linkMediaToJournal(
          created.id,
          saveMedia(created.id, e.images[0]),
          "image",
        );
      if (e.audio[0])
        localDB.linkMediaToJournal(
          created.id,
          saveMedia(created.id, e.audio[0]),
          "audio",
        );
      ids.push(created.id);
    }
  });
  run();

  lastImport = { userId, ids, at: new Date().toISOString() };
  // Index the new entries for search in one sweep, rather than queueing AI
  // title and summary generation for every one of them.
  global.qdrantWorker?.postMessage({ type: "journal:bulk-sync-requested" });
  return { imported: ids.length };
}

export async function handleUndoImport() {
  const userId = requireUser();
  if (!lastImport || lastImport.userId !== userId)
    throw new Error("No import to undo");
  let removed = 0;
  for (const id of lastImport.ids)
    removed += localDB.deleteJournalEntry(userId, id);
  lastImport = null;
  return { removed };
}
