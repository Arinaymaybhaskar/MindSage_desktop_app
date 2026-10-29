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
import Store from "electron-store";
import { eventBus } from "../eventBus.js";
import localDB from "../db/index.js";
import { db } from "../db/connection.js";
import { exportEverything } from "../db/exportData.js";
import { currentUserId } from "../session.js";
import { purge } from "./trash.js";
import { getIndexer } from "./search.js";
import {
  EXPORT_FORMATS,
  FORMAT_NAMES,
  readAny,
  writeAny,
} from "../portability/index.js";
import { basename } from "../portability/common.js";
import { modelStore } from "../store.js";
import { modelsReady } from "../ai/llama.js";
import { importStatuses } from "./importBackfill.js";
import { backfillEnrichment } from "./ollama.js";
import { clampMoodLevel } from "../moodWords.js";
import { log } from "../log.js";

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
  let outOfRange = 0;
  const media = (key) => {
    if (!key) return [];
    try {
      return [{ name: basename(key), data: fs.readFileSync(key) }];
    } catch {
      missingMedia++;
      return [];
    }
  };
  const mood = (score) => {
    const level = clampMoodLevel(score);
    if (level !== null && level !== score) outOfRange++;
    return level;
  };
  const entries = rows.map((r) => ({
    title: r.title || null,
    content: r.content ?? "",
    createdAt: r.created_at,
    updatedAt: r.updated_at || null,
    // 1 to 5; a stored score outside that is clamped, as the app shows it.
    mood: mood(r.mood_score),
    tags: r.tag_list ? r.tag_list.split("\u001f") : [],
    images: media(r.image_key),
    audio: media(r.audio_key),
  }));
  if (outOfRange)
    log.warn("export: mood scores out of 1 to 5 were clamped", { outOfRange });
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

/** A message a person can act on, for the ways reading or writing a file fails. */
export function importErrorText(err, name) {
  const who = name ? `${name} ` : "That file ";
  if (["EBUSY", "EPERM", "EACCES", "EAGAIN"].includes(err?.code))
    return `${who}is locked or open in another program. Close it and try again.`;
  if (err?.code === "ENOENT")
    return `${who}can't be found. It may have been moved or deleted.`;
  if (err?.code === "ENOSPC")
    return "Your disk is full. Free some space and try again; nothing was imported.";
  return null;
}

let pending = null; // { userId, format, entries, duplicates }

// Each profile's latest import, { at, source, ids, edited }, kept across
// restarts so it can still be undone (KAN-74). Ids only, never entry text; a
// newer import replaces it, so only the latest can be undone.
let store; // lazy: importing this file must not open the store
const imports = () =>
  (store ??= new Store({ name: "last-import", defaults: { users: {} } }));
const getLast = (userId) => imports().get(`users.${userId}`) ?? null;
const setLast = (userId, last) =>
  last
    ? imports().set(`users.${userId}`, last)
    : imports().delete(`users.${userId}`);

// Only the editor's save emits journal:edited (AI fills do not), so an edit
// here means the person changed an imported entry: Undo would lose that.
eventBus.on("journal:edited", ({ userId, entry }) => {
  try {
    const last = userId && getLast(userId);
    if (last && !last.edited && last.ids.includes(entry?.id))
      setLast(userId, { ...last, edited: true });
  } catch {
    // The edit is saved either way; Undo stays as it was.
  }
});

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
  const inputs = filePaths.map((p) => {
    try {
      return { name: path.basename(p), data: fs.readFileSync(p) };
    } catch (err) {
      throw new Error(
        importErrorText(err, path.basename(p)) ??
          `${path.basename(p)} couldn't be read: ${err.message}`,
      );
    }
  });
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

// Entries written per transaction; the main process yields between chunks so
// a 5,000-entry import never freezes the app or holds up finishing setup.
const CHUNK = 250;
let importing = false;

// Progress goes to the Local AI panel, named by the app it came from.
const report = (event, data) => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed())
    win.webContents.send("ai-status-event", { event, data });
};

// Models here or a provider chosen: enrich now. Otherwise ai:models-ready does.
const aiReady = () =>
  modelsReady() ||
  ["ollama", "openai", "gguf"].includes(modelStore.get("aiProvider"));

export async function handleCommitImport() {
  const userId = requireUser();
  if (importing) throw new Error("An import is already running");
  if (undoing) throw new Error("Wait for the undo to finish");
  if (!pending || pending.userId !== userId)
    throw new Error("Nothing to import; pick a file first");
  const { entries, format } = pending;
  pending = null;
  if (!entries.length) return { imported: 0 };

  const mediaRoot = path.join(app.getPath("userData"), "media", "journals");
  const savedFiles = [];
  const saveMedia = (journalId, item) => {
    const dir = path.join(mediaRoot, String(journalId));
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(
      dir,
      `${Date.now()}-${item.name.replace(/[^\w.-]/g, "_")}`,
    );
    fs.writeFileSync(dest, item.data);
    savedFiles.push(dest);
    return dest;
  };

  // Saved after every chunk: if the app stops part way, what was written can
  // still be undone. A failed import puts the previous one back.
  const ids = [];
  const previous = getLast(userId);
  const last = {
    at: new Date().toISOString(),
    source: FORMAT_NAMES[format] ?? null,
    ids,
    edited: false,
  };
  const statuses = importStatuses(entries);
  const fixUp = db.prepare(
    "UPDATE journal_entries SET mood_score = ?, updated_at = ? WHERE id = ?",
  );
  const markForBackfill = db.prepare(
    `UPDATE journal_entries SET ai_metadata_status = @ai_metadata_status,
       ai_metadata_error = @ai_metadata_error, ai_summary_status = @ai_summary_status,
       ai_summary_error = @ai_summary_error WHERE id = @id`,
  );
  const writeChunk = db.transaction((from) => {
    const written = [];
    for (let i = from; i < Math.min(from + CHUNK, entries.length); i++) {
      const e = entries[i];
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
      if (statuses[i]) markForBackfill.run({ ...statuses[i], id: created.id });
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
      written.push(created.id);
    }
    return written;
  });

  const kind = `${FORMAT_NAMES[format] ?? "imported"} entries`;
  const total = entries.length;
  importing = true;
  try {
    report("import:bulkStarted", { kind, total });
    for (let from = 0; from < total; from += CHUNK) {
      ids.push(...writeChunk(from));
      setLast(userId, last);
      report("import:bulkProgress", { kind, done: ids.length, total });
      await new Promise((resolve) => setImmediate(resolve));
    }
  } catch (err) {
    // No partial import: take back what was written and keep the preview so
    // the person can try again once the cause is fixed.
    const written = ids.splice(0);
    await removeEntries(userId, written).catch(() => undefined);
    for (const f of savedFiles) fs.rmSync(f, { force: true });
    setLast(userId, previous);
    pending = { userId, format, entries };
    throw new Error(
      importErrorText(err) ??
        `The import stopped and was undone: ${err.message}`,
    );
  } finally {
    importing = false;
    report("import:bulkCompleted", {
      kind,
      total,
      done: ids.length,
      failed: total - ids.length,
    });
    // Index the new entries for search in one sweep, rather than queueing AI
    // title and summary generation for every one of them.
    if (ids.length) getIndexer()?.sweep();
  }
  // One bounded backfill instead of per-entry AI (KAN-80).
  if (aiReady()) backfillEnrichment();
  return { imported: ids.length };
}

/** The signed-in profile's latest import, for the Import tab, or null. */
export async function handleLastImport() {
  const last = getLast(requireUser());
  if (!last?.ids.length) return null;
  const { at, source, ids, edited } = last;
  return { at, source, count: ids.length, edited };
}

let undoing = false;

export async function handleUndoImport() {
  const userId = requireUser();
  if (importing) throw new Error("Wait for the import to finish");
  if (undoing) throw new Error("Undo is already running");
  const last = getLast(userId);
  if (!last?.ids.length) throw new Error("No import to undo");
  if (last.edited)
    throw new Error(
      "Undo is off because an entry from this import was edited since. Delete the entries you don't want instead.",
    );
  undoing = true;
  try {
    const removed = await removeEntries(userId, last.ids);
    setLast(userId, null);
    return { removed };
  } finally {
    undoing = false;
  }
}

// Removes entries outright rather than filling the Trash with every one of
// them: the user just chose to take them back.
async function removeEntries(userId, ids) {
  let removed = 0;
  for (const id of ids) removed += localDB.deleteJournalEntry(userId, id);
  await purge(userId, { entryIds: ids, goalIds: [] });
  return removed;
}
