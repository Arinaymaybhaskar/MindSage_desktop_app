import { eventBus } from "../eventBus.js";
import { spawn } from "child_process";
import {
  AISummaryPrompt,
  getAutoPopulateValues,
  isSummarizable,
  parseJournalMetadata,
  sanitizeSummary,
} from "./AIPrompts.js";
import { modelStore } from "../store.js";
import { currentUserId } from "../session.js";
import { db } from "../db/connection.js";
import { log } from "../log.js";
import { listOllamaModels } from "./ollamaList.js";

/**
 * `ollama:models`: the installed models for Settings > Models.
 *
 * Asynchronous and bounded (see `ollamaList.js`): a hung Ollama answers
 * `{ error, reason: "timeout" }` after a few seconds instead of freezing the
 * main process (KAN-369), and one that is not running answers
 * `{ error, reason: "unreachable" }`.
 */
export const handleGetOllamaModels = async () => {
  const userId = currentUserId();
  if (!userId) return { error: "Not signed in" };

  const result = await listOllamaModels({
    onShowError: (name, err) =>
      log.error(`Error fetching info for ${name}`, err),
  });
  if (!Array.isArray(result)) {
    log.warn("Could not list Ollama models", { reason: result.reason });
  }
  return result;
};

/**
 * Streaming counterpart to `handleOllamaPrompt`.
 *
 * `/api/generate` with `stream: true` answers NDJSON - one JSON object per
 * line, each carrying the next fragment in its `response` field - so the body
 * has to be read incrementally and split on newlines with a carry buffer; a
 * single chunk from the socket routinely ends mid-line.
 *
 * `onToken` receives each fragment as it arrives. The full concatenated text is
 * returned at the end, so a caller that also needs to parse the finished output
 * (JSON mode, retries) can use this as a drop-in for the non-streaming call.
 *
 * Deliberately not an IPC handler: the renderer must not be able to open a
 * generation stream directly, and callers need the per-token callback, which
 * cannot cross the IPC boundary as a function.
 */
export const streamOllamaPrompt = async (
  model,
  prompt,
  { jsonMode = false, numPredict = 300, onToken, signal } = {},
) => {
  if (!model || !prompt) throw new Error("Model name and prompt are required.");

  const requestBody = { model, prompt, stream: true, num_predict: numPredict };
  if (jsonMode) requestBody.format = "json";

  const res = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
    signal,
  });

  if (!res.ok) {
    throw new Error(`Ollama HTTP error: ${res.status} ${res.statusText}`);
  }
  if (!res.body) throw new Error("Ollama returned no response body.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let carry = "";
  let full = "";

  /** Handles one complete NDJSON line. */
  const consumeLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // A malformed line is not worth aborting a whole generation over.
      return;
    }
    if (parsed.error) throw new Error(`Ollama error: ${parsed.error}`);
    if (typeof parsed.response === "string" && parsed.response.length > 0) {
      full += parsed.response;
      onToken?.(parsed.response, full);
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      carry += decoder.decode(value, { stream: true });

      let newlineAt;
      while ((newlineAt = carry.indexOf("\n")) !== -1) {
        consumeLine(carry.slice(0, newlineAt));
        carry = carry.slice(newlineAt + 1);
      }
    }
    // The final line may arrive without a trailing newline.
    consumeLine(carry + decoder.decode());
  } finally {
    // Releasing matters on the abort path: an unreleased reader keeps the
    // socket open and the model loaded.
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }

  return full;
};

export const handleOllamaPrompt = async (
  event,
  model,
  prompt,
  jsonMode = false,
) => {
  // const userId = currentUserId();
  // if (!userId) {
  //     return { error: "Not signed in" };
  // }
  log.debug("Ollama prompt", { model, promptChars: prompt?.length });
  if (!model || !prompt) {
    return { error: "Model name and prompt are required." };
  }

  try {
    const requestBody = {
      model,
      prompt,
      stream: false, // full output as one JSON
      num_predict: 300, // limit tokens for speed
    };

    // Enable JSON mode if requested
    if (jsonMode) {
      requestBody.format = "json";
    }

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
    log.error("Ollama error:", err);
    return { error: err.message };
  }
};

export const handleOllamaImagePrompt = async (
  event,
  model,
  prompt,
  imagePath,
) => {
  const userId = currentUserId();
  if (!userId) {
    return { error: "Not signed in" };
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
    log.error("Ollama image error:", err);
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
    db.prepare(
      `UPDATE journal_entries SET ai_metadata_status = 'pending' WHERE id = ?`,
    ).run(entry.id);
    const prompt = getAutoPopulateValues(entry.content);

    // Get the selected chat model from settings
    const selectedModels = modelStore.get("selectedModels");
    const model = selectedModels?.chat || "llama3.2:latest"; // Fallback model
    log.debug("Filling in missing details", { model });
    try {
      const res2 = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          format: "json", // constrain the model to valid JSON
          num_predict: 300,
        }),
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
      eventBus.emit("journal:aiCompleted", {
        entry,
        metadata,
        entryId: entry.id,
      });
    } catch (err) {
      log.error("AI metadata generation failed:", err);
      db.prepare(
        `UPDATE journal_entries SET ai_metadata_status = 'failed', ai_metadata_error = ? WHERE id = ?`,
      ).run(err.message, entry.id);
      eventBus.emit("journal:aiFailed", {
        entryId: entry.id,
        error: err.message,
      });
    }
  } else {
    db.prepare(
      `UPDATE journal_entries SET ai_metadata_status = 'completed' WHERE id = ?`,
    ).run(entry.id);
  }
});

// Update the journal:created event handler for summary generation
eventBus.on("journal:created", async ({ entry }) => {
  eventBus.emit("ollama:summary-started", { entryId: entry.id });
  db.prepare(
    `UPDATE journal_entries SET ai_summary_status = 'pending' WHERE id = ?`,
  ).run(entry.id);
  const prompt = AISummaryPrompt(entry.content);
  if (!isSummarizable(entry.content)) {
    db.prepare(
      `UPDATE journal_entries SET ai_summary_status = 'skipped' WHERE id = ?`,
    ).run(entry.id);
    eventBus.emit("ollama:summary-skipped", { entryId: entry.id });
    return; // Too few words to produce a meaningful summary
  }
  // Get the selected chat model from settings
  const selectedModels = modelStore.get("selectedModels");
  const model = selectedModels?.chat || "llama3.2:latest"; // Fallback model

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
    if (!res2.ok) {
      throw new Error(`Ollama HTTP error: ${res2.status} ${res2.statusText}`);
    }

    const aiRes = await res2.json();
    const summary = sanitizeSummary(aiRes.response);
    if (!summary) {
      const error = "AI could not produce a valid summary";
      db.prepare(
        `UPDATE journal_entries SET ai_summary_status = 'failed', ai_summary_error = ? WHERE id = ?`,
      ).run(error, entry.id);
      eventBus.emit("ollama:summary-failed", { entryId: entry.id, error });
      return;
    }
    const id = entry.id;
    const userId = entry.user_id;

    db.prepare(
      `UPDATE journal_entries SET ai_summary_status = 'completed', ai_summary_error = NULL WHERE id = ?`,
    ).run(entry.id);
    eventBus.emit("ollama:summary-generated", {
      summary,
      id,
      userId,
      entryId: entry.id,
    });
  } catch (err) {
    log.error("AI summary generation failed:", err);
    db.prepare(
      `UPDATE journal_entries SET ai_summary_status = 'failed', ai_summary_error = ? WHERE id = ?`,
    ).run(err.message, entry.id);
    eventBus.emit("ollama:summary-failed", {
      entryId: entry.id,
      error: err.message,
    });
  }
});

// Update generateSuggestion to use selected model
export async function generateSuggestion(prompt, maxTokens = 20) {
  try {
    // Get the selected chat model from settings
    const selectedModels = modelStore.get("selectedModels");
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
        system:
          "You are a raw text completion model. Your only job is to continue the user's text. Do not add any commentary, greetings, or conversational filler. Directly output the next sequence of words.",
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
    log.error("[generateSuggestion] Error fetching suggestion:", error);
    // Return an empty string on failure so the frontend doesn't break
    return "";
  }
}

export const handleDownloadOllamaModel = (event, modelName) => {
  const userId = currentUserId();
  if (!userId) {
    return { error: "Not signed in" };
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

export const handleDeleteOllamaModel = (event, modelName) => {
  const userId = currentUserId();
  if (!userId) {
    return { error: "Not signed in" };
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
    const response = await fetch("http://localhost:11434/api/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "nomic-embed-text:v1.5",
        prompt: text,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Ollama embedding API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    return data.embedding;
  } catch (error) {
    log.error("Error generating embedding:", error);
    throw error;
  }
}
