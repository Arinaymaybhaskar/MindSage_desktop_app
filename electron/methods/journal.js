import localDB from "../db/index.js";
import { db } from "../db/connection.js";
import { eventBus } from "../eventBus.js";
import { updateJournalEntry } from "../db/journal.js";
import { isSummarizable } from "./AIPrompts.js";
import { generateMetadata, generateSummary } from "./ollama.js";
import { background } from "../ai/queue.js";
import { getFeatures, metadataOn, metadataParts } from "../ai/features.js";
import { currentUserId } from "../session.js";
import { log } from "../log.js";

export async function handleCreateJournal(event, payload) {
  const userId = currentUserId();
  if (!userId) throw new Error("Not signed in");
  let createdJournal;
  createdJournal = localDB.createJournalEntry(userId, payload);
  eventBus.emit("journal:created", {
    userId,
    entry: createdJournal,
  });
  return createdJournal;
}

export async function handleGettingImages(event, getMode) {
  const userId = currentUserId();
  if (!userId) throw new Error("Not signed in");
  return localDB.getImageKeysAndIds(userId, getMode);
}

export async function handleGetRecentJournals(event) {
  const userId = currentUserId();
  if (!userId) throw new Error("Not signed in");

  return localDB.getRecentEntries(userId);
}

export async function handleGetAllJournals(event, page, limit) {
  const userId = currentUserId();
  if (!userId) throw new Error("Not signed in");

  const offset = page * limit; // Calculate offset from page and limit
  const ans = localDB.getAllEntries(userId, limit, offset);
  return ans;
}

export async function handleGetJournalById(event, journalId) {
  const userId = currentUserId();
  if (!userId) throw new Error("Not signed in");

  log.info("Fetching journal by ID in offline mode:", journalId);
  return localDB.getJournalById(userId, journalId);
}

export async function handleUpdateJournal(event, journalId, payload) {
  const userId = currentUserId();
  if (!userId) throw new Error("Not signed in");
  let updatedJournal;
  updatedJournal = localDB.updateJournalEntry(userId, journalId, payload);
  // The indexer re-embeds it if the words changed.
  eventBus.emit("journal:updated", { entry: updatedJournal });
  // People re-reads the entry only if its text actually changed.
  if (updatedJournal)
    eventBus.emit("journal:edited", { userId, entry: updatedJournal });
  if (updatedJournal.audio_key) {
    eventBus.emit("journal:audio-saved", { entry: updatedJournal, event });
  }

  return updatedJournal;
}

/** The user ticked a feeling word the AI offered (KAN-437): it becomes a tag. */
export async function handleAcceptFeeling(event, journalId, name) {
  const userId = currentUserId();
  if (!userId) throw new Error("Not signed in");
  const updated = localDB.acceptSuggestedTag(userId, journalId, name);
  if (!updated) return { error: "That feeling is no longer offered" };
  eventBus.emit("journal:updated", { entry: updated });
  // The person changed the entry: an import Undo must not take it (KAN-479).
  eventBus.emit("journal:edited", { userId, entry: updated });
  return updated;
}

export async function handleUpdateAIStatus(event, journalId, fields) {
  const userId = currentUserId();
  if (!userId) throw new Error("Not signed in");
  const changes = localDB.updateAIStatus(userId, journalId, fields || {});
  return { success: changes > 0 };
}

export async function handleDeleteJournal(event, journalId) {
  const userId = currentUserId();
  if (!userId) throw new Error("Not signed in");

  const changes = localDB.deleteJournalEntry(userId, journalId);
  if (changes === 0)
    throw new Error("Journal entry not found or permission denied");
  return { message: "Journal entry marked for deletion" };
}

export async function handleChat(event, payload) {
  return {
    answer:
      "I can only answer questions when you are online. Please connect to the internet to use the chat feature.",
  };
}

export async function handleGetChartData(event, range) {
  const userId = currentUserId();
  if (!userId) throw new Error("Not signed in");
  return localDB.getMoodScores(userId, range);
}

const addContentSummary = (summary, journalId, userId) => {
  return localDB.addContentSummary(summary, journalId, userId);
};

// `metadata` is already parsed + sanitized by parseJournalMetadata at the
// generation site, so this persister just merges and writes. It also owns the
// final 'completed' status transition so the entry is never marked completed
// with empty fields. `force` (set by an explicit user regenerate) overwrites
// the AI fields; auto-generation on create only fills blanks.
eventBus.on("journal:aiCompleted", ({ entry: queued, metadata, force }) => {
  // The call may have waited in the AI queue (KAN-89): write over the entry as
  // it is now, so an edit made meanwhile is kept, and leave a Trashed one be.
  const entry = localDB.getJournalById(queued.user_id, queued.id);
  if (!entry) return;
  if (!metadata) {
    const error = "AI returned incomplete or invalid metadata";
    db.prepare(
      `UPDATE journal_entries SET ai_metadata_status = 'failed', ai_metadata_error = ? WHERE id = ?`,
    ).run(error, entry.id);
    eventBus.emit("journal:aiFailed", { entryId: entry.id, error });
    return;
  }

  let updated = entry;
  // Title and mood come only when "Enrich entries" is on (KAN-437).
  if ("title" in metadata) {
    const enrichedEntry = force
      ? // Explicit regenerate: replace the AI-generated fields.
        { title: metadata.title, mood_score: metadata.mood_score }
      : {
          // Auto-generate: preserve anything already filled in; fill blanks.
          title: entry.title?.trim() || metadata.title,
          mood_score: entry.mood_score ?? metadata.mood_score,
        };
    updated = localDB.updateJournalEntry(entry.user_id, entry.id, {
      ...enrichedEntry,
      content: entry.content,
    });
  }
  // Feeling words are only offered: none becomes a tag until the user ticks
  // it (KAN-437), and one already ticked is not offered again.
  if (metadata.mood_tags) {
    updated = localDB.setSuggestedTags(
      entry.user_id,
      entry.id,
      metadata.mood_tags.filter((name) => !entry.mood_tags.includes(name)),
    );
  }
  db.prepare(
    `UPDATE journal_entries SET ai_metadata_status = 'completed', ai_metadata_error = NULL WHERE id = ?`,
  ).run(entry.id);
  eventBus.emit("journal:updated", { entry: updated });
});

eventBus.on("ollama:summary-generated", ({ summary, id, userId }) => {
  addContentSummary(summary, id, userId);
});

eventBus.on("whisper:transcribe-ended", ({ entry, transcriptionText }) => {
  updateJournalEntry(entry.user_id, entry.id, {
    ...entry,
    transcription: transcriptionText,
  });
  eventBus.emit("journal:updated", {
    entry: { ...entry, transcription: transcriptionText },
  });
});

eventBus.on("custom:test-event", (data) => {
  log.debug("Custom test event received");
});

// --- AI Metadata Retry Handler ---
export async function handleRetryAIMetadata(event, journalId, type) {
  const userId = currentUserId();
  if (!userId) throw new Error("Not signed in");

  const entry = localDB.getJournalById(userId, journalId);
  if (!entry) throw new Error("Journal entry not found");

  const features = getFeatures(userId);
  const off = { success: false, error: "This AI feature is turned off" };

  if (type === "metadata") {
    if (!metadataOn(features)) return off;
    // Reset status to pending
    db.prepare(
      `UPDATE journal_entries SET ai_metadata_status = 'pending', ai_metadata_error = NULL WHERE id = ?`,
    ).run(journalId);

    // Trigger the AI metadata generation again
    eventBus.emit("journal:aiStarted", { entryId: entry.id });

    try {
      const metadata = await background(() =>
        generateMetadata(entry.content, userId, metadataParts(features)),
      );
      // The journal:aiCompleted persister writes the fields and flips the
      // status to 'completed'. force:true because this is an explicit user
      // retry/regenerate: overwrite the existing AI fields.
      eventBus.emit("journal:aiCompleted", {
        entry,
        metadata,
        entryId: entry.id,
        force: true,
      });
      return { success: true };
    } catch (err) {
      log.error("AI metadata retry failed:", err);
      db.prepare(
        `UPDATE journal_entries SET ai_metadata_status = 'failed', ai_metadata_error = ? WHERE id = ?`,
      ).run(err.message, journalId);
      eventBus.emit("journal:aiFailed", {
        entryId: entry.id,
        error: err.message,
      });
      return { success: false, error: err.message };
    }
  } else if (type === "summary") {
    if (!features.enrich) return off;
    // Too short to summarize: skip consistently with the create path
    // instead of feeding a 1-sentence entry to a "3-5 sentence" prompt.
    if (!isSummarizable(entry.content)) {
      db.prepare(
        `UPDATE journal_entries SET ai_summary_status = 'skipped', ai_summary_error = NULL WHERE id = ?`,
      ).run(journalId);
      eventBus.emit("ollama:summary-skipped", { entryId: entry.id });
      return { success: true, skipped: true };
    }

    // Reset status to pending
    db.prepare(
      `UPDATE journal_entries SET ai_summary_status = 'pending', ai_summary_error = NULL WHERE id = ?`,
    ).run(journalId);

    eventBus.emit("ollama:summary-started", { entryId: entry.id });

    try {
      const summary = await background(() => generateSummary(entry.content));
      if (!summary) {
        const error = "AI could not produce a valid summary";
        db.prepare(
          `UPDATE journal_entries SET ai_summary_status = 'failed', ai_summary_error = ? WHERE id = ?`,
        ).run(error, journalId);
        eventBus.emit("ollama:summary-failed", { entryId: entry.id, error });
        return { success: false, error };
      }
      db.prepare(
        `UPDATE journal_entries SET ai_summary_status = 'completed', ai_summary_error = NULL WHERE id = ?`,
      ).run(journalId);
      localDB.addContentSummary(summary, entry.id, userId);
      eventBus.emit("ollama:summary-generated", {
        summary,
        id: entry.id,
        userId,
        entryId: entry.id,
      });
      return { success: true };
    } catch (err) {
      log.error("AI summary retry failed:", err);
      db.prepare(
        `UPDATE journal_entries SET ai_summary_status = 'failed', ai_summary_error = ? WHERE id = ?`,
      ).run(err.message, journalId);
      eventBus.emit("ollama:summary-failed", {
        entryId: entry.id,
        error: err.message,
      });
      return { success: false, error: err.message };
    }
  }

  throw new Error("Invalid type. Must be 'metadata' or 'summary'");
}
