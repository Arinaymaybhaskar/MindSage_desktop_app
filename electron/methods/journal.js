import localDB from "../db/index.js";
import { db } from "../db/connection.js";
import jwt from "jsonwebtoken";
import { eventBus } from "../eventBus.js";
import { updateJournalEntry } from "../db/journal.js";
import {
  AISummaryPrompt,
  getAutoPopulateValues,
  isSummarizable,
  parseJournalMetadata,
  sanitizeSummary,
} from "./AIPrompts.js";
import { modelStore } from "../store.js";

function getUserIdFromToken(token) {
  try {
    // 1. Guard against null or undefined tokens
    if (!token) {
      return null;
    }
    const decoded = jwt.decode(token);
    // 2. Ensure the token was successfully decoded and has an id
    return decoded;
  } catch (e) {
    console.error("Error decoding token:", e);
    return null;
  }
}

export async function handleCreateJournal(event, token, payload) {
  const userId = getUserIdFromToken(token).id;
  if (!userId) throw new Error("Invalid token");
  let createdJournal;
  createdJournal = localDB.createJournalEntry(userId, payload);
  eventBus.emit("journal:created", {
    userId,
    entry: createdJournal,
  });
  return createdJournal;
}

export async function handleGettingImages(event, token, getMode) {
  const userId = getUserIdFromToken(token).id;
  if (!userId) throw new Error("Invalid token");
  return localDB.getImageKeysAndIds(userId, getMode);
}

export async function handleGetRecentJournals(event, token) {
  const userId = getUserIdFromToken(token).id;
  if (!userId) throw new Error("Invalid token");

  return localDB.getRecentEntries(userId);
}

export async function handleGetAllJournals(event, token, page, limit) {
  const userId = getUserIdFromToken(token).id;
  if (!userId) throw new Error("Invalid token");

  const offset = page * limit; // Calculate offset from page and limit
  const ans = localDB.getAllEntries(userId, limit, offset);
  return ans;
}

export async function handleGetJournalById(event, token, journalId) {
  const userId = getUserIdFromToken(token).id;
  if (!userId) throw new Error("Invalid token");

  console.log("Fetching journal by ID in offline mode:", journalId);
  return localDB.getJournalById(userId, journalId);
}

export async function handleUpdateJournal(event, token, journalId, payload) {
  const userId = getUserIdFromToken(token).id;
  if (!userId) throw new Error("Invalid token");
  let updatedJournal;
  updatedJournal = localDB.updateJournalEntry(userId, journalId, payload);
  if (updatedJournal.audio_key) {
    eventBus.emit("journal:audio-saved", { entry: updatedJournal, event });
  }

  return updatedJournal;
}

export async function handleUpdateAIStatus(event, token, journalId, fields) {
  const userId = getUserIdFromToken(token).id;
  if (!userId) throw new Error("Invalid token");
  const changes = localDB.updateAIStatus(userId, journalId, fields || {});
  return { success: changes > 0 };
}

export async function handleDeleteJournal(event, token, journalId) {
  const userId = getUserIdFromToken(token).id;
  if (!userId) throw new Error("Invalid token");

  const changes = localDB.deleteJournalEntry(userId, journalId);
  if (changes === 0)
    throw new Error("Journal entry not found or permission denied");
  return { message: "Journal entry marked for deletion" };
}

export async function handleChat(event, token, payload) {
  return {
    answer:
      "I can only answer questions when you are online. Please connect to the internet to use the chat feature.",
  };
}

export async function handleGetChartData(event, token, range) {
  const userId = getUserIdFromToken(token).id;
  if (!userId) throw new Error("Invalid token");
  return localDB.getMoodScores(userId, range);
}

export const getPendingJournals = (userId) => {
  if (!userId) throw new Error("Invalid userId");
  return localDB.getPendingJournals(userId);
};

export const updateSyncStatus = (userId, journalId, status) => {
  if (!userId) throw new Error("Invalid userId");
  if (!journalId) throw new Error("Invalid journalId");
  if (!status) throw new Error("Invalid status");
  return localDB.updateSyncStatus(userId, journalId, status);
};

const addContentSummary = (summary, journalId, userId) => {
  return localDB.addContentSummary(summary, journalId, userId);
};

// `metadata` is already parsed + sanitized by parseJournalMetadata at the
// generation site, so this persister just merges and writes. It also owns the
// final 'completed' status transition so the entry is never marked completed
// with empty fields. `force` (set by an explicit user regenerate) overwrites
// the AI fields; auto-generation on create only fills blanks.
eventBus.on("journal:aiCompleted", ({ entry, metadata, force }) => {
  if (!metadata) {
    const error = "AI returned incomplete or invalid metadata";
    db.prepare(
      `UPDATE journal_entries SET ai_metadata_status = 'failed', ai_metadata_error = ? WHERE id = ?`,
    ).run(error, entry.id);
    eventBus.emit("journal:aiFailed", { entryId: entry.id, error });
    return;
  }

  const enrichedEntry = force
    ? {
        // Explicit regenerate: replace the AI-generated fields.
        title: metadata.title,
        mood_score: metadata.mood_score,
        mood_tags: metadata.mood_tags,
        content: entry.content,
      }
    : {
        // Auto-generate: preserve anything already filled in; fill blanks.
        title: entry.title?.trim() || metadata.title,
        mood_score: entry.mood_score ?? metadata.mood_score,
        mood_tags:
          Array.isArray(entry.mood_tags) && entry.mood_tags.length > 0
            ? entry.mood_tags
            : metadata.mood_tags,
        content: entry.content,
      };

  const updated = localDB.updateJournalEntry(
    entry.user_id,
    entry.id,
    enrichedEntry,
  );
  db.prepare(
    `UPDATE journal_entries SET ai_metadata_status = 'completed', ai_metadata_error = NULL WHERE id = ?`,
  ).run(entry.id);
  eventBus.emit("journal:updated", { entry: updated });
  // Trigger Qdrant update with the new fields via worker message
  if (global.qdrantWorker) {
    global.qdrantWorker.postMessage({
      type: "journal:qdrant-update-needed",
      data: { entry: updated },
    });
  } else {
    console.error(
      `[JOURNAL] Qdrant worker not available for journal ID: ${entry.id}`,
    );
  }
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
  console.log("Custom test event received with data:", data);
});

// --- AI Metadata Retry Handler ---
export async function handleRetryAIMetadata(event, token, journalId, type) {
  const userId = getUserIdFromToken(token).id;
  if (!userId) throw new Error("Invalid token");

  const entry = localDB.getJournalById(userId, journalId);
  if (!entry) throw new Error("Journal entry not found");

  if (type === "metadata") {
    // Reset status to pending
    db.prepare(
      `UPDATE journal_entries SET ai_metadata_status = 'pending', ai_metadata_error = NULL WHERE id = ?`,
    ).run(journalId);

    // Trigger the AI metadata generation again
    eventBus.emit("journal:aiStarted", { entryId: entry.id });

    const prompt = getAutoPopulateValues(entry.content);
    const selectedModels = (await import("../store.js")).modelStore.get(
      "selectedModels",
    );
    const model = selectedModels?.chat || "llama3.2:latest";

    try {
      const res2 = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          format: "json",
          num_predict: 300,
        }),
      });
      if (!res2.ok) throw new Error(`Ollama HTTP error: ${res2.status}`);
      const aiRes = await res2.json();
      const metadata = parseJournalMetadata(aiRes.response);
      if (!metadata)
        throw new Error("AI returned incomplete or invalid metadata");
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
      console.error("AI metadata retry failed:", err);
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

    const prompt = AISummaryPrompt(entry.content);
    const selectedModels = (await import("../store.js")).modelStore.get(
      "selectedModels",
    );
    const model = selectedModels?.chat || "llama3.2:latest";

    try {
      const res2 = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          num_predict: 300,
        }),
      });
      if (!res2.ok) throw new Error(`Ollama HTTP error: ${res2.status}`);
      const aiRes = await res2.json();
      const summary = sanitizeSummary(aiRes.response);
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
      console.error("AI summary retry failed:", err);
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
