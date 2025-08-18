import localDB from "../db";
import jwt from "jsonwebtoken";
import axios from 'axios'

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
    console.log(mode, payload)
    if (mode === 'online') {
        const response = await axios.post('http://localhost:4000/api/journals', payload, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return response.data;
    } else { // Offline

        return localDB.createJournalEntry(userId, payload);
    }
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
        const ans = localDB.getAllEntries(userId, page, limit);
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

    if (mode === 'online') {
        const response = await axios.put(`http://localhost:4000/api/journals/${journalId}`, payload, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return response.data;
    } else { // Offline
        return localDB.updateJournalEntry(userId, journalId, payload);
    }
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