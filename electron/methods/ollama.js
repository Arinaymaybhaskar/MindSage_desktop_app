import { execSync, exec } from 'child_process';
import { getUserIdFromToken } from '../../src/utils/electronUtils';
import { eventBus } from "../eventBus.js";
import { spawn } from "child_process";
import { AISummaryPrompt, generateContextTimeAndBaseQueryPrompt, getAutoPopulateValues, parseJournalMetadata, respondWithContext, respondWithoutContext } from './AIPrompts.js';
import { modelStore } from '../store.js';
import { SemanticSearch } from './qdrant.js';
import z from 'zod';
import { db } from '../db/connection.js';

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


export const handleOllamaPrompt = async (event, token, model, prompt, jsonMode = false,) => {
    // const userId = getUserIdFromToken(token);
    // if (!userId) {
    //     return { error: "Invalid token" };
    // }
    console.log(model, prompt, "model", "prompt");
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
        db.prepare(`UPDATE journal_entries SET ai_metadata_status = 'pending' WHERE id = ?`).run(entry.id);
        const prompt = getAutoPopulateValues(entry.content);

        // Get the selected chat model from settings
        const selectedModels = modelStore.get('selectedModels');
        const model = selectedModels?.chat || "llama3.2:latest"; // Fallback model
        console.log(model, "model used for filing up missing details")
        try {
            const res2 = await fetch('http://localhost:11434/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model,
                    prompt,
                    stream: false,
                    format: 'json', // constrain the model to valid JSON
                    num_predict: 300
                })
            });
            if (!res2.ok) {
                throw new Error(`Ollama HTTP error: ${res2.status} ${res2.statusText}`);
            }
            const aiRes = await res2.json();
            const metadata = parseJournalMetadata(aiRes.response);
            if (!metadata) {
                throw new Error("AI returned incomplete or invalid metadata");
            }
            // Status is set to 'completed' by the journal:aiCompleted persister
            // once the sanitized metadata is written, so it can't be marked
            // completed with empty fields.
            eventBus.emit("journal:aiCompleted", { entry, metadata, entryId: entry.id });
        } catch (err) {
            console.error("AI metadata generation failed:", err);
            db.prepare(`UPDATE journal_entries SET ai_metadata_status = 'failed', ai_metadata_error = ? WHERE id = ?`).run(err.message, entry.id);
            eventBus.emit("journal:aiFailed", { entryId: entry.id, error: err.message });
        }
    } else {
        db.prepare(`UPDATE journal_entries SET ai_metadata_status = 'completed' WHERE id = ?`).run(entry.id);
    }
});

// Update the journal:created event handler for summary generation
eventBus.on("journal:created", async ({ entry }) => {
    eventBus.emit("ollama:summary-started", { entryId: entry.id });
    db.prepare(`UPDATE journal_entries SET ai_summary_status = 'pending' WHERE id = ?`).run(entry.id);
    const prompt = AISummaryPrompt(entry.content);
    if (entry.content.length < 100) {
        db.prepare(`UPDATE journal_entries SET ai_summary_status = 'skipped' WHERE id = ?`).run(entry.id);
        eventBus.emit("ollama:summary-skipped", { entryId: entry.id });
        return; // Skip summary for very short entries
    }
    // Get the selected chat model from settings
    const selectedModels = modelStore.get('selectedModels');
    const model = selectedModels?.chat || "llama3.2:latest"; // Fallback model

    try {
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
        if (!res2.ok) {
            throw new Error(`Ollama HTTP error: ${res2.status} ${res2.statusText}`);
        }

        const aiRes = await res2.json();
        const summary = aiRes.response;
        const id = entry.id;
        const userId = entry.user_id;

        db.prepare(`UPDATE journal_entries SET ai_summary_status = 'completed' WHERE id = ?`).run(entry.id);
        eventBus.emit("ollama:summary-generated", { summary, id, userId, entryId: entry.id });
    } catch (err) {
        console.error("AI summary generation failed:", err);
        db.prepare(`UPDATE journal_entries SET ai_summary_status = 'failed', ai_summary_error = ? WHERE id = ?`).run(err.message, entry.id);
        eventBus.emit("ollama:summary-failed", { entryId: entry.id, error: err.message });
    }
});

// Schemas
const propsResSchema = z.object({
    requires_context: z.boolean(),
    requires_time_filter: z.boolean().optional().default(false),
    time_filter_from: z.string().nullish().default(null),
    time_filter_to: z.string().nullish().default(null),
    base_query: z.string().optional().default(""),
    notes: z.string().optional().default("")
});

const chatResponseSchema = z.object({
    response: z.string(),
    // Matches the key the prompt actually asks for and the renderer consumes.
    suggested_user_prompt: z.string()
});

// Helper: parse and retry AI JSON
async function parseAIWithRetries(rawFn, schema, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log("calling ai");
            const raw = await rawFn();
            console.log("ai response", raw);
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error("No JSON found");

            return schema.parse(JSON.parse(jsonMatch[0]));
        } catch (err) {
            console.log(`Attempt ${attempt} failed: ${err.message}`);
            if (attempt === maxRetries) throw new Error(`Failed after ${maxRetries} attempts`);
        }
    }
}

eventBus.on("chat:new-message", async ({ content, chatId, messageId, model, userId }) => {
    try {
        const now = new Date();
        const currentTimeISO = now.toISOString();

        // 1️⃣ Generate propsRes
        const queryPropsPrompt = generateContextTimeAndBaseQueryPrompt(content, currentTimeISO);
        const propsRes = await parseAIWithRetries(
            () => handleOllamaPrompt("", "", model, queryPropsPrompt, true),
            propsResSchema,
            3
        );
        console.log("Validated propsRes:", propsRes);

        let semanticResult = [];

        // 2️⃣ Semantic search logic
        if (propsRes.requires_context) {
            // Use original user content
            console.log("requires context")
            const vector = await generateEmbedding(content);
            semanticResult = await SemanticSearch(vector, userId, 5, "mind_entries");
        } else if (propsRes.requires_time_filter) {
            console.log("requires context with time filter")
            // Use base_query and time filter
            const vector = await generateEmbedding(propsRes.base_query);
            semanticResult = await SemanticSearch(vector, userId, 5, "mind_entries", {
                from: propsRes.time_filter_from,
                to: propsRes.time_filter_to
            });
        }

        let mainPrompt;

        if (!propsRes.requires_context && semanticResult.length == 0) {
            console.log("No context needed")
            mainPrompt = respondWithoutContext(content);
        } else {
            // 3️⃣ Generate prompt for main AI response
            mainPrompt = respondWithContext(
                content,
                semanticResult,
            );
        }

        // 4️⃣ Get final chat response
        const chatResponse = await parseAIWithRetries(
            () => handleOllamaPrompt("", "", model, mainPrompt, true),
            chatResponseSchema,
            3
        );
        console.log(chatResponse, "ai chat res")
        // 5️⃣ Emit validated response
        eventBus.emit("chat:response-generated", { response: chatResponse, chatId, messageId, semanticResult });

    } catch (error) {
        console.log(error, "error occcured");
        eventBus.emit("chat:error", error);
    }
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

export async function generateEmbedding(text) {
    try {
        const response = await fetch('http://localhost:11434/api/embeddings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'nomic-embed-text:v1.5',
                prompt: text
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama embedding API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data.embedding;
    } catch (error) {
        console.error('Error generating embedding:', error);
        throw error;
    }
}

