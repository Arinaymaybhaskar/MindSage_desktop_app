import { execSync, exec } from 'child_process';
import { getUserIdFromToken } from '../../src/utils/electronUtils';
import { eventBus } from "../eventBus.js";
import { AISummaryPrompt, getAutoPopulateValues } from './AIPrompts.js';
// import { getAutoPopulateValues } from '../utils/prompts/journal.js';

export const handleGetOllamaModels = (event, token) => {
    const userId = getUserIdFromToken(token);
    if (!userId) {
        return { error: "Invalid token" };
    }
    try {
        // Run 'ollama list' to get models
        const output = execSync('ollama list', { encoding: 'utf-8' });

        // Split into lines and skip the header
        const lines = output.trim().split('\n').slice(1);

        // Map each line into an object { name, size, modified }
        const models = lines.map(line => {
            const parts = line.trim().split(/\s{2,}/); // split by 2+ spaces
            return {
                name: parts[0],
                size: parts[1],
                modified: parts[2]
            };
        });

        return models;
    } catch (error) {
        console.error('Error fetching Ollama models:', error);
        return [];
    }
};

export const handleOllamaPrompt = async (event, token, model, prompt, jsonMode = false) => {
    const userId = getUserIdFromToken(token);
    if (!userId) {
        return { error: "Invalid token" };
    }
    if (!model || !prompt) {
        return { error: 'Model name and prompt are required.' };
    }

    try {
        const requestBody = {
            model,
            prompt,
            stream: false, // full output as one JSON
            num_predict: 300 // limit tokens for speed
        };

        // Enable JSON mode if requested
        if (jsonMode) {
            requestBody.format = 'json';
        }

        const res = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!res.ok) {
            throw new Error(`Ollama HTTP error: ${res.status} ${res.statusText}`);
        }

        const data = await res.json();
        return data.response;
    } catch (err) {
        console.error('Ollama error:', err);
        return { error: err.message };
    }
};

console.log('ollama methods loaded — registering journal:created listener');

// Define a TypeScript type for the journal:created event payload
/**
 * @typedef {Object} JournalCreatedEvent
 * @property {string} userId
 * @property {any} entry
 * @property {string} mode
 */

// Only destructure 'entry' since 'userId' and 'mode' are unused
eventBus.on("journal:created", async ({ entry }) => {
    const needsAiCompletion =
        !entry?.title?.trim() ||
        entry?.mood_score === undefined ||
        !entry?.mood_tags?.length;
    if (needsAiCompletion) {
        eventBus.emit("journal:aiStarted", { entryId: entry.id });
        const prompt = getAutoPopulateValues(entry.content);
        const res2 = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "llama3.2:latest",
                prompt,
                stream: false, // full output as one JSON
                num_predict: 300 // limit tokens for speed
            })
        });
        const aiRes = await res2.json();
        console.log("[handleSubmit] AI Response received:", aiRes.response);
        const res3 = aiRes.response
        eventBus.emit("journal:aiCompleted", { entry, res3 });
    } else {
        return;
    }
});

eventBus.on("journal:created", async ({ entry }) => {
    eventBus.emit("ollama:summary-started", { entryId: entry.id });
    const prompt = AISummaryPrompt(entry.content);
    const res2 = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: "llama3.2:latest",
            prompt,
            stream: false, // full output as one JSON
            num_predict: 300 // limit tokens for speed
        })
    });

    const aiRes = await res2.json();
    const summary = aiRes.response;
    const id = entry.id;
    const userId = entry.user_id;

    eventBus.emit("ollama:summary-generated", { summary, id, userId });
})