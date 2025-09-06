import localDB from "../db";
import jwt from "jsonwebtoken";
import axios from 'axios'
import { eventBus } from "../eventBus.js";
import { updateJournalEntry } from "../db/journal.js";

function getUserIdFromToken(token) {
    try {
        // 1. Guard against null or undefined tokens
        if (!token) {
            return null;
        }
        const decoded = jwt.decode(token);
        // 2. Ensure the token was successfully decoded and has an id
        console.log(decoded);
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
    console.log("Getting all entries", mode, token);
    const userId = getUserIdFromToken(token).id;
    if (!userId) throw new Error("Invalid token");

    if (mode === 'online') {
        const response = await axios.get('http://localhost:4000/api/journals', {
            headers: { Authorization: `Bearer ${token}` }
        });
        return response.data;
    } else { // Offline
        console.log("Getting all entries offline");
        const offset = page * limit; // Calculate offset from page and limit
        const ans = localDB.getAllEntries(userId, limit, offset);
        console.log(ans);
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
    console.log(updatedJournal)
    if (updatedJournal.audio_key) {
        eventBus.emit("journal:audio-saved", ({ entry: updatedJournal, event }))
    }

    return updatedJournal;
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

eventBus.on("journal:aiCompleted", ({ entry, res3 }) => {
    try {
        res3 = typeof res3 === "string" ? JSON.parse(res3) : (res3 || {});
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
});


eventBus.on("ollama:summary-generated", ({ summary, id, userId }) => {
    addContentSummary(summary, id, userId);
})

eventBus.on("whisper:transcribe-ended", ({ entry, transcriptionText }) => {
    console.log("📝 Transcription text:", transcriptionText);
    updateJournalEntry(entry.user_id, entry.id, { ...entry, transcription: transcriptionText });
    eventBus.emit("journal:updated", { entry: { ...entry, transcription: transcriptionText } });
});
