import { eventBus } from "../eventBus.js";
import { spawn } from "child_process";
import {
  AISummaryPrompt,
  JOURNAL_METADATA_SCHEMA,
  MAX_OUTPUT_TOKENS,
  getAutoPopulateValues,
  isSummarizable,
  parseJournalMetadata,
  sanitizeSummary,
} from "./AIPrompts.js";
import { generate } from "../ai/client.js";
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

/** `ollama:get-response`: one generation through the AI client. */
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
  log.debug("AI prompt", { model, promptChars: prompt?.length });
  // No model is fine: the built-in engine picks its own, and Ollama falls
  // back to the selected chat model.
  if (!prompt) return { error: "A prompt is required." };

  try {
    return await generate(prompt, {
      json: jsonMode,
      ollamaModel: model,
      maxTokens: MAX_OUTPUT_TOKENS,
    });
  } catch (err) {
    log.error("AI prompt error:", err);
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

    const res = await fetch("http://127.0.0.1:11434/api/generate", {
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
    log.debug("Filling in missing details", { entryId: entry.id });
    try {
      const metadata = parseJournalMetadata(
        await generate(prompt, {
          schema: JOURNAL_METADATA_SCHEMA,
          maxTokens: MAX_OUTPUT_TOKENS,
        }),
      );
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

  try {
    const summary = sanitizeSummary(
      await generate(prompt, { maxTokens: MAX_OUTPUT_TOKENS }),
    );
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
    const ollamaModel = selectedModels?.decision || "llama3.2:latest"; // Fallback model

    const text = await generate(prompt, {
      ollamaModel,
      maxTokens,
      system:
        "You are a raw text completion model. Your only job is to continue the user's text. Do not add any commentary, greetings, or conversational filler. Directly output the next sequence of words.",
      temperature: 0.2,
    });
    return text.trim();
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

    // A missing binary emits "error" (never "close"); unhandled, it throws.
    child.on("error", (err) => {
      reject({ error: `Download failed: ${err.message}` });
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

    child.on("error", (err) => {
      reject({ error: `Delete failed: ${err.message}` });
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
