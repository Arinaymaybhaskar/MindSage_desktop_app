import { execSync, exec } from 'child_process';
import { getUserIdFromToken } from '../../src/utils/electronUtils';
import { eventBus } from "../eventBus.js";
import { spawn } from "child_process";
import { AISummaryPrompt, getAutoPopulateValues } from './AIPrompts.js';
import { modelStore } from '../store.js';

export const handleGetOllamaModels = async (event, token) => {
    const userId = getUserIdFromToken(token);
    if (!userId) return { error: "Invalid token" };

    try {
        // 1️⃣ Get the basic list of models
        const listOutput = execSync("ollama list", { encoding: "utf-8" });
        const lines = listOutput.trim().split("\n").slice(1);
        const models = lines.map((line) => {
            const parts = line.trim().split(/\s{2,}/);
            return {
                name: parts[0],
                size: parts[1],
                modified: parts[2],
            };
        });

        // 2️⃣ Enrich with API show info in parallel
        const enrichedModels = await Promise.all(
            models.map(async (model) => {
                try {
                    const res = await fetch("http://localhost:11434/api/show", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ model: model.name, verbose: true }),
                    });
                    const info = await res.json();

                    if (info && info.model_info) {
                        delete info.model_info["tokenizer.ggml.merges"];
                        delete info.model_info["tokenizer.ggml.scores"];
                        delete info.model_info["tokenizer.ggml.token_type"];
                        delete info.model_info["tokenizer.ggml.tokens"];
                        delete info["tensors"];
                        delete info["modelfile"];
                        delete info["license"];
                    }
                    return { ...model, info };
                } catch (err) {
                    console.error(`Error fetching info for ${model.name}`, err);
                    return model; // fallback to basic info
                }
            })
        );

        return enrichedModels;
    } catch (err) {
        console.error("Error fetching Ollama models:", err);
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

export const handleOllamaImagePrompt = async (
    event,
    token,
    model,
    prompt,
    imagePath
) => {
    const userId = getUserIdFromToken(token);
    if (!userId) {
        return { error: "Invalid token" };
    }
    if (!model || !prompt || !imagePath) {
        return { error: "Model name, prompt, and image path are required." };
    }

    try {
        const requestBody = {
            model,
            prompt,
            images: [imagePath], // 👈 Ollama vision API expects an array of image paths/base64
            stream: false,
            num_predict: 300,
        };

        const res = await fetch("http://localhost:11434/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
        });

        if (!res.ok) {
            throw new Error(`Ollama HTTP error: ${res.status} ${res.statusText}`);
        }

        const data = await res.json();
        return data.response;
    } catch (err) {
        console.error("Ollama image error:", err);
        return { error: err.message };
    }
};


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

        // Get the selected chat model from settings
        const selectedModels = modelStore.get('selectedModels');
        const model = selectedModels?.chat || "llama3.2:latest"; // Fallback model
        console.log(model, "model used for filing up missing details")
        const res2 = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                prompt,
                stream: false,
                num_predict: 300
            })
        });
        console.log(res2, "ollama response");
        const aiRes = await res2.json();
        const res3 = aiRes.response
        eventBus.emit("journal:aiCompleted", { entry, res3 });
    }
});

// Update the journal:created event handler for summary generation
eventBus.on("journal:created", async ({ entry }) => {
    eventBus.emit("ollama:summary-started", { entryId: entry.id });
    const prompt = AISummaryPrompt(entry.content);

    // Get the selected chat model from settings
    const selectedModels = modelStore.get('selectedModels');
    const model = selectedModels?.chat || "llama3.2:latest"; // Fallback model

    const res2 = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            prompt,
            stream: false,
            num_predict: 300
        })
    });

    const aiRes = await res2.json();
    const summary = aiRes.response;
    const id = entry.id;
    const userId = entry.user_id;

    eventBus.emit("ollama:summary-generated", { summary, id, userId });
});

// Update generateSuggestion to use selected model
export async function generateSuggestion(prompt, maxTokens = 20) {
    try {
        // Get the selected chat model from settings
        const selectedModels = modelStore.get('selectedModels');
        const model = selectedModels?.decision || "llama3.2:latest"; // Fallback model

        const response = await fetch("http://localhost:11434/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model,
                prompt,
                options: {
                    num_predict: maxTokens,
                },
                system: "You are a raw text completion model. Your only job is to continue the user's text. Do not add any commentary, greetings, or conversational filler. Directly output the next sequence of words.",
                temperature: 0.2,
                stream: false,
            }),
        });

        // Handle non-successful HTTP responses
        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }

        // Since stream is false, parse the entire JSON body at once
        const data = await response.json();

        // The generated text is in the 'response' property
        return data.response.trim();

    } catch (error) {
        console.error("[generateSuggestion] Error fetching suggestion:", error);
        // Return an empty string on failure so the frontend doesn't break
        return "";
    }
}

export const handleDownloadOllamaModel = (event, token, modelName) => {
    const userId = getUserIdFromToken(token);
    if (!userId) {
        return { error: "Invalid token" };
    }
    if (!modelName) {
        return { error: "Model name is required" };
    }

    return new Promise((resolve, reject) => {
        const child = spawn("ollama", ["pull", modelName]);

        let output = "";
        let errorOutput = "";

        child.stdout.on("data", (data) => {
            output += data.toString();
            // 🔹 You can also stream progress to renderer:
            // eventBus.emit("ollama:download-progress", { model: modelName, chunk: data.toString() });
        });

        child.stderr.on("data", (data) => {
            errorOutput += data.toString();
        });

        child.on("close", (code) => {
            if (code === 0) {
                resolve({ success: true, message: `${modelName} downloaded` });
            } else {
                reject({ error: `Download failed: ${errorOutput}` });
            }
        });
    });
};

export const handleDeleteOllamaModel = (event, token, modelName) => {
    const userId = getUserIdFromToken(token);
    if (!userId) {
        return { error: "Invalid token" };
    }
    if (!modelName) {
        return { error: "Model name is required" };
    }

    return new Promise((resolve, reject) => {
        const child = spawn("ollama", ["rm", modelName]);

        let output = "";
        let errorOutput = "";

        child.stdout.on("data", (data) => {
            output += data.toString();
        });

        child.stderr.on("data", (data) => {
            errorOutput += data.toString();
        });

        child.on("close", (code) => {
            if (code === 0) {
                resolve({ success: true, message: `${modelName} deleted` });
            } else {
                reject({ error: `Delete failed: ${errorOutput || output}` });
            }
        });
    });
};

