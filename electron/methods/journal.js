import localDB from "../db";
import { db } from "../db/connection.js";
import jwt from "jsonwebtoken";
import axios from 'axios'
import { eventBus } from "../eventBus.js";
import { updateJournalEntry } from "../db/journal.js";
import { AISummaryPrompt, getAutoPopulateValues } from "./AIPrompts.js";
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

export async function handleCreateJournal(event, mode, token, payload) {
    const userId = getUserIdFromToken(token).id;
    if (!userId) throw new Error("Invalid token");
    let createdJournal;
    if (mode === 'online') {
        const response = await axios.post('http://localhost:4000/api/journals', payload, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return response.data;
    } else { // Offline
        createdJournal = localDB.createJournalEntry(userId, payload);
    }
    eventBus.emit("journal:created", {
        userId,
        entry: createdJournal,
        mode
    });
    return createdJournal;
}

export async function handleGettingImages(event, mode, token, getMode) {
    const userId = getUserIdFromToken(token).id;
    if (!userId) throw new Error("Invalid token");
    if (mode === 'online') {
        const response = await axios.get('http://localhost:4000/api/journals/images', {
            headers: { Authorization: `Bearer ${token}` }
        });
        return response.data;
    } else {
        // Offline
        return localDB.getImageKeysAndIds(userId, getMode);
    }
}

export async function handleGetRecentJournals(event, mode, token) {
    const userId = getUserIdFromToken(token).id;
    if (!userId) throw new Error("Invalid token");

    if (mode === 'online') {
        const response = await axios.get('http://localhost:4000/api/journals/recent', {
            headers: { Authorization: `Bearer ${token}` }
        });
        return response.data;
    } else { // Offline
        return localDB.getRecentEntries(userId);
    }
}

export async function handleGetAllJournals(event, mode, token, page, limit) {
    const userId = getUserIdFromToken(token).id;
    if (!userId) throw new Error("Invalid token");

    if (mode === 'online') {
        const response = await axios.get('http://localhost:4000/api/journals', {
            headers: { Authorization: `Bearer ${token}` }
        });
        return response.data;
    } else { // Offline
        const offset = page * limit; // Calculate offset from page and limit
        const ans = localDB.getAllEntries(userId, limit, offset);
        return ans
    }
}

export async function handleGetJournalById(event, mode, token, journalId) {
    const userId = getUserIdFromToken(token).id;
    if (!userId) throw new Error("Invalid token");

    if (mode === 'online') {
        const response = await axios.get(`http://localhost:4000/api/journals/${journalId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return response.data;
    } else { // Offline
        console.log("Fetching journal by ID in offline mode:", journalId);
        return localDB.getJournalById(userId, journalId);
    }
}

export async function handleUpdateJournal(event, mode, token, journalId, payload) {
    const userId = getUserIdFromToken(token).id;
    if (!userId) throw new Error("Invalid token");
    let updatedJournal;
    if (mode === 'online') {
        const response = await axios.put(`http://localhost:4000/api/journals/${journalId}`, payload, {
            headers: { Authorization: `Bearer ${token}` }
        });
        updatedJournal = response.data;
    } else { // Offline
        updatedJournal = localDB.updateJournalEntry(userId, journalId, payload);
    }
    if (updatedJournal.audio_key) {
        eventBus.emit("journal:audio-saved", ({ entry: updatedJournal, event }))
    }

    return updatedJournal;
}

export async function handleUpdateAIStatus(event, token, journalId, fields) {
    const userId = getUserIdFromToken(token).id;
    if (!userId) throw new Error("Invalid token");
    const changes = localDB.updateAIStatus(userId, journalId, fields || {});
    return { success: changes > 0 };
}

export async function handleDeleteJournal(event, mode, token, journalId) {
    const userId = getUserIdFromToken(token).id;
    if (!userId) throw new Error("Invalid token");

    if (mode === 'online') {
        const response = await axios.delete(`http://localhost:4000/api/journals/${journalId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return response.data;
    } else { // Offline
        const changes = localDB.deleteJournalEntry(userId, journalId);
        if (changes === 0) throw new Error("Journal entry not found or permission denied");
        return { message: "Journal entry marked for deletion" };
    }
}

export async function handleChat(event, mode, token, payload) {
    if (mode === 'online') {
        const response = await axios.post('http://localhost:4000/api/journals/chat', payload, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return response.data;
    } else { // Offline
        // AI chat is not available offline. Return a helpful message.
        return { answer: "I can only answer questions when you are online. Please connect to the internet to use the chat feature." };
    }
}

export async function handleGetChartData(event, mode, token, range) {
    const userId = getUserIdFromToken(token).id;
    if (!userId) throw new Error("Invalid token");
    if (mode === 'online') {
        console.log("later")
    } else { // Offline
        return localDB.getMoodScores(userId, range);
    }
}

export const getPendingJournals = (userId) => {
    if (!userId) throw new Error("Invalid userId");
    return localDB.getPendingJournals(userId);
}

export const updateSyncStatus = (userId, journalId, status) => {
    if (!userId) throw new Error("Invalid userId");
    if (!journalId) throw new Error("Invalid journalId");
    if (!status) throw new Error("Invalid status");
    return localDB.updateSyncStatus(userId, journalId, status);
}



const addContentSummary = (summary, journalId, userId) => {
    return localDB.addContentSummary(summary, journalId, userId);
}
function cleanAndParseJSON(inputStr) {
    try {
        // Remove Markdown code block markers like ```json ... ```
        const cleaned = inputStr
            .replace(/```json/i, "") // remove opening ```json
            .replace(/```/g, "")     // remove closing ```
            .trim();

        return JSON.parse(cleaned);
    } catch (err) {
        console.error("Failed to parse JSON:", err.message);
        return {};
    }
}

eventBus.on("journal:aiCompleted", ({ entry, res3 }) => {
    try {
        res3 = typeof res3 === "string" ? cleanAndParseJSON(res3) : (res3 || {});
    } catch (err) {
        console.error("Failed to parse AI response (res3):", err);
        res3 = {};
    }
    const enrichedEntry = {
        title: entry.title ?? res3.title,
        mood_score: entry.mood_score ?? res3.mood_score,
        mood_tags: (Array.isArray(entry.mood_tags) && entry.mood_tags.length > 0) ? entry.mood_tags : (Array.isArray(res3.mood_tags) ? res3.mood_tags : []),
        content: entry.content,
    };

    const updated = localDB.updateJournalEntry(entry.user_id, entry.id, enrichedEntry);
    eventBus.emit("journal:updated", { entry: updated });
    // Trigger Qdrant update with the new fields via worker message
    if (global.qdrantWorker) {
        global.qdrantWorker.postMessage({
            type: 'journal:qdrant-update-needed',
            data: { entry: updated }
        });
    } else {
        console.error(`[JOURNAL] Qdrant worker not available for journal ID: ${entry.id}`);
    }
});


eventBus.on("ollama:summary-generated", ({ summary, id, userId }) => {
    addContentSummary(summary, id, userId);
})

eventBus.on("whisper:transcribe-ended", ({ entry, transcriptionText }) => {
    updateJournalEntry(entry.user_id, entry.id, { ...entry, transcription: transcriptionText });
    eventBus.emit("journal:updated", { entry: { ...entry, transcription: transcriptionText } });
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

    if (type === 'metadata') {
        // Reset status to pending
        db.prepare(`UPDATE journal_entries SET ai_metadata_status = 'pending', ai_metadata_error = NULL WHERE id = ?`).run(journalId);

        // Trigger the AI metadata generation again
        eventBus.emit("journal:aiStarted", { entryId: entry.id });

        const prompt = getAutoPopulateValues(entry.content);
        const selectedModels = (await import("../store.js")).modelStore.get('selectedModels');
        const model = selectedModels?.chat || "llama3.2:latest";

        try {
            const res2 = await fetch('http://localhost:11434/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model, prompt, stream: false, num_predict: 300 })
            });
            if (!res2.ok) throw new Error(`Ollama HTTP error: ${res2.status}`);
            const aiRes = await res2.json();
            const res3 = aiRes.response;
            eventBus.emit("journal:aiCompleted", { entry, res3 });
            return { success: true };
        } catch (err) {
            console.error("AI metadata retry failed:", err);
            db.prepare(`UPDATE journal_entries SET ai_metadata_status = 'failed', ai_metadata_error = ? WHERE id = ?`).run(err.message, journalId);
            eventBus.emit("journal:aiFailed", { entryId: entry.id, error: err.message });
            return { success: false, error: err.message };
        }
    } else if (type === 'summary') {
        // Reset status to pending
        db.prepare(`UPDATE journal_entries SET ai_summary_status = 'pending', ai_summary_error = NULL WHERE id = ?`).run(journalId);

        eventBus.emit("ollama:summary-started", { entryId: entry.id });

        const prompt = AISummaryPrompt(entry.content);
        // Allow retry even for short entries
        if (entry.content.length < 100) {
            console.log("Entry content < 100 chars, but retrying anyway on user request");
        }
        const selectedModels = (await import("../store.js")).modelStore.get('selectedModels');
        const model = selectedModels?.chat || "llama3.2:latest";

        try {
            const res2 = await fetch('http://localhost:11434/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model, prompt, stream: false, num_predict: 300 })
            });
            if (!res2.ok) throw new Error(`Ollama HTTP error: ${res2.status}`);
            const aiRes = await res2.json();
            const summary = aiRes.response;
            db.prepare(`UPDATE journal_entries SET ai_summary_status = 'completed' WHERE id = ?`).run(journalId);
            localDB.addContentSummary(summary, entry.id, userId);
            eventBus.emit("ollama:summary-generated", { summary, id: entry.id, userId });
            return { success: true };
        } catch (err) {
            console.error("AI summary retry failed:", err);
            db.prepare(`UPDATE journal_entries SET ai_summary_status = 'failed', ai_summary_error = ? WHERE id = ?`).run(err.message, journalId);
            eventBus.emit("ollama:summary-failed", { entryId: entry.id, error: err.message });
            return { success: false, error: err.message };
        }
    }

    throw new Error("Invalid type. Must be 'metadata' or 'summary'");
}