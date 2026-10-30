import { eventBus } from "../eventBus.js";
import { spawn } from "child_process";
import {
  AISummaryPrompt,
  ALL_METADATA,
  MAX_CUSTOM_IN_PROMPT,
  MAX_OUTPUT_TOKENS,
  getAutoPopulateValues,
  isSummarizable,
  journalMetadataSchema,
  parseJournalMetadata,
  sanitizeSummary,
} from "./AIPrompts.js";
import { generate, taskModel } from "../ai/client.js";
import { background, yieldToAsk } from "../ai/queue.js";
import { getFeatures, metadataOn, metadataParts } from "../ai/features.js";
import { classifyFeelings, summarySupported } from "../ai/onnx.js";
import { modelStore } from "../store.js";
import { currentUserId } from "../session.js";
import { db } from "../db/connection.js";
import localDB from "../db/index.js";
import { log } from "../log.js";
import { humanBytes, listOllamaModels } from "./ollamaList.js";
import { BUILTIN_MODELS } from "../ai/models.js";
import { isDownloaded } from "../ai/llama.js";
import { BACKFILL_LIMIT } from "./importBackfill.js";

/** How long a good list is reused; a pull or delete drops it sooner. */
export const MODEL_LIST_TTL_MS = 45_000;

let cached = null; // { at, rows }
let inFlight = null;
let generation = 0; // a list that started before an invalidation is not kept

/** Drops the cached list; called when a model is pulled or deleted. */
export const clearModelListCache = () => {
  cached = null;
  inFlight = null;
  generation++;
};

/** Built-in engine mode: the models on disk, in the row shape Settings reads. */
const builtinRows = () =>
  Object.entries(BUILTIN_MODELS)
    .filter(
      ([id, m]) => m.role !== "voice" && m.role !== "onnx" && isDownloaded(id),
    )
    .map(([id, m]) => ({ name: id, size: "", modified: humanBytes(m.bytes) }));

const fetchModelList = () => {
  const started = generation;
  const pending = listOllamaModels({
    onShowError: (name, err) =>
      log.error(`Error fetching info for ${name}`, err),
  })
    .then((result) => {
      if (!Array.isArray(result)) {
        log.warn("Could not list Ollama models", { reason: result.reason });
      } else if (started === generation) {
        cached = { at: Date.now(), rows: result };
      }
      return result;
    })
    .finally(() => {
      if (inFlight === pending) inFlight = null;
    });
  return pending;
};

/**
 * `ollama:models`: the installed models for Settings > Models.
 *
 * Asynchronous and bounded (see `ollamaList.js`): a hung Ollama answers
 * `{ error, reason: "timeout" }` after a few seconds instead of freezing the
 * main process (KAN-369), and one that is not running answers
 * `{ error, reason: "unreachable" }`. A good list is cached for
 * `MODEL_LIST_TTL_MS` and concurrent calls share one request (KAN-90);
 * failures are never cached. With the built-in engine chosen, the list is
 * the downloaded model files and Ollama is not asked.
 */
export const handleGetOllamaModels = async () => {
  const userId = currentUserId();
  if (!userId) return { error: "Not signed in" };

  if (modelStore.get("aiProvider") === "builtin") return builtinRows();
  if (cached && Date.now() - cached.at < MODEL_LIST_TTL_MS) return cached.rows;
  return (inFlight ??= fetchModelList());
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

// One stuck call would hold up every entry queued behind it.
const ENRICH_TIMEOUT_MS = 5 * 60_000;
/** Ask's abort (yieldToAsk) or the timeout, whichever comes first. */
const enrichSignal = (signal) =>
  AbortSignal.any([signal, AbortSignal.timeout(ENRICH_TIMEOUT_MS)]);

/**
 * Title, mood and tags: one JSON-schema call (KAN-89). Throws when unusable.
 * The user's most used own words join the tags it may pick (KAN-94). `parts`
 * leaves out the title and mood or the feeling words (KAN-437); with feelings
 * left out, no feeling word, the user's own included, reaches the model.
 */
export async function generateMetadata(content, userId, parts = ALL_METADATA) {
  const custom = parts.feelings
    ? localDB.customFeelingWords(userId, MAX_CUSTOM_IN_PROMPT)
    : [];
  const metadata = parseJournalMetadata(
    await yieldToAsk((signal) =>
      generate(getAutoPopulateValues(content, custom, parts), {
        schema: journalMetadataSchema(custom, parts),
        maxTokens: MAX_OUTPUT_TOKENS,
        model: taskModel("metadata"),
        signal: enrichSignal(signal),
      }),
    ),
    custom,
    parts,
  );
  if (!metadata) throw new Error("AI returned incomplete or invalid metadata");
  return metadata;
}

/** A summary the entailment gate rejects is written again this many times in all. */
export const SUMMARY_TRIES = 2;

/**
 * The summary, its own call (KAN-89); null when the model gave no usable one
 * or every try said something the entry does not (KAN-388): it is held, not
 * saved, and the entry offers Retry. Without the gate's model it is saved as
 * before.
 */
export async function generateSummary(content) {
  for (let attempt = 1; attempt <= SUMMARY_TRIES; attempt++) {
    const summary = await draftSummary(content);
    if (!summary) return null;
    if ((await summarySupported(content, summary)) !== false) return summary;
    log.info("Summary failed the entailment gate", { attempt });
  }
  return null;
}

async function draftSummary(content) {
  return sanitizeSummary(
    await yieldToAsk((signal) =>
      generate(AISummaryPrompt(content), {
        maxTokens: MAX_OUTPUT_TOKENS,
        model: taskModel("summary"),
        signal: enrichSignal(signal),
      }),
    ),
  );
}

// Title, mood and tags first, then the summary, as one job in the shared AI
// queue: the two calls never overlap, so a PC with room for one model swaps
// between them instead of loading both, and Ask goes first.
eventBus.on("journal:created", ({ entry }) => {
  const features = getFeatures(entry.user_id);
  const needsAiCompletion =
    (features.enrich &&
      (!entry?.title?.trim() || entry?.mood_score === undefined)) ||
    (features.feelings && !entry?.mood_tags?.length);
  if (needsAiCompletion) {
    eventBus.emit("journal:aiStarted", { entryId: entry.id });
    db.prepare(
      `UPDATE journal_entries SET ai_metadata_status = 'pending' WHERE id = ?`,
    ).run(entry.id);
  } else {
    db.prepare(
      `UPDATE journal_entries SET ai_metadata_status = 'completed' WHERE id = ?`,
    ).run(entry.id);
  }

  eventBus.emit("ollama:summary-started", { entryId: entry.id });
  db.prepare(
    `UPDATE journal_entries SET ai_summary_status = 'pending' WHERE id = ?`,
  ).run(entry.id);
  const summarizable = features.enrich && isSummarizable(entry.content);
  if (!summarizable) {
    db.prepare(
      `UPDATE journal_entries SET ai_summary_status = 'skipped' WHERE id = ?`,
    ).run(entry.id);
    eventBus.emit("ollama:summary-skipped", { entryId: entry.id });
  }

  if (needsAiCompletion || summarizable) {
    background(async () => {
      // The job may have waited: work on the entry as it is now, and not at
      // all if it went to the Trash.
      const current = localDB.getJournalById(entry.user_id, entry.id);
      if (!current) return markTrashedNotRun(entry.id);
      // A switch turned off while the job waited stops it (KAN-70).
      const now = getFeatures(entry.user_id);
      if (needsAiCompletion && metadataOn(now))
        await fillMetadata(current, now);
      if (summarizable && now.enrich) await fillSummary(current);
    }).catch((err) => log.error("AI enrichment failed:", err));
  }
});

// A job skipped because its entry went to the Trash leaves nothing 'pending':
// after a restore the entry offers Retry, and the next backfill picks it up
// (KAN-393).
const TRASHED_ERROR = "Moved to the Trash before the AI ran";
function markTrashedNotRun(id) {
  db.prepare(
    `UPDATE journal_entries SET ai_metadata_status = 'failed', ai_metadata_error = ?
     WHERE id = ? AND ai_metadata_status = 'pending'`,
  ).run(TRASHED_ERROR, id);
  db.prepare(
    `UPDATE journal_entries SET ai_summary_status = 'failed', ai_summary_error = ?
     WHERE id = ? AND ai_summary_status = 'pending'`,
  ).run(TRASHED_ERROR, id);
}

/**
 * Runs the fill-in again, once, in the queue, for the newest entries whose
 * enrichment failed: saved while the models were missing, or imported (KAN-80,
 * see importBackfill.js). Bounded by BACKFILL_LIMIT; safe to call twice.
 */
export function backfillEnrichment() {
  const rows = db
    .prepare(
      `SELECT id, user_id FROM journal_entries
       WHERE is_deleted = 0 AND (ai_metadata_status = 'failed' OR ai_summary_status = 'failed')
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(BACKFILL_LIMIT);
  for (const row of rows) {
    background(async () => {
      const current = localDB.getJournalById(row.user_id, row.id);
      if (!current) return;
      const now = getFeatures(row.user_id);
      // Statuses as they are now: an earlier backfill or a retry may have filled them.
      // The *Started events put the entry on the status card (KAN-486).
      if (current.ai_metadata_status === "failed" && metadataOn(now)) {
        eventBus.emit("journal:aiStarted", { entryId: current.id });
        await fillMetadata(current, now);
      }
      if (
        current.ai_summary_status === "failed" &&
        now.enrich &&
        isSummarizable(current.content)
      ) {
        eventBus.emit("ollama:summary-started", { entryId: current.id });
        await fillSummary(current);
      }
    }).catch((err) => log.error("AI backfill failed:", err));
  }
}

// The models just arrived (setup finished after an offline start).
eventBus.on("ai:models-ready", backfillEnrichment);

async function fillMetadata(entry, features) {
  log.debug("Filling in missing details", { entryId: entry.id });
  // The feelings classifier goes first (KAN-388): it runs on the CPU, so its
  // feeling words arrive even when no chat model can run. null when it is not
  // downloaded; then the chat model's tags are used, as before.
  const feelings =
    features.feelings && !entry.mood_tags?.length
      ? await classifyFeelings(entry.content)
      : null;
  try {
    // The chat model is asked for feeling words only when the classifier
    // gave none (KAN-437 parts), and not at all when nothing else is on.
    const parts = {
      ...metadataParts(features),
      feelings: features.feelings && feelings === null,
    };
    const metadata = metadataOn(parts)
      ? await generateMetadata(entry.content, entry.user_id, parts)
      : {};
    if (feelings) metadata.mood_tags = feelings;
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
    if (feelings?.length) keepClassifiedFeelings(entry, feelings);
    db.prepare(
      `UPDATE journal_entries SET ai_metadata_status = 'failed', ai_metadata_error = ? WHERE id = ?`,
    ).run(err.message, entry.id);
    eventBus.emit("journal:aiFailed", {
      entryId: entry.id,
      error: err.message,
    });
  }
}

/**
 * The chat model failed: the classifier's words are still offered (KAN-437),
 * leaving out any the user ticked meanwhile.
 */
function keepClassifiedFeelings(queued, feelings) {
  const entry = localDB.getJournalById(queued.user_id, queued.id);
  if (!entry) return;
  const updated = localDB.setSuggestedTags(
    entry.user_id,
    entry.id,
    feelings.filter((name) => !entry.mood_tags.includes(name)),
  );
  eventBus.emit("journal:updated", { entry: updated });
}

async function fillSummary(entry) {
  try {
    const summary = await generateSummary(entry.content);
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
}

// Update generateSuggestion to use selected model
export async function generateSuggestion(prompt, maxTokens = 20) {
  const userId = currentUserId();
  if (userId && !getFeatures(userId).suggestions) return "";
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

    let errorOutput = "";

    child.stdout.on("data", (data) => {
      // 🔹 You can also stream progress to renderer:
      // eventBus.emit("ollama:download-progress", { model: modelName, chunk: data.toString() });
    });

    child.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    // A missing binary emits "error" (never "close"); unhandled, it throws.
    child.on("error", (err) => {
      clearModelListCache();
      reject({ error: `Download failed: ${err.message}` });
    });

    child.on("close", (code) => {
      clearModelListCache();
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
      clearModelListCache();
      reject({ error: `Delete failed: ${err.message}` });
    });

    child.on("close", (code) => {
      clearModelListCache();
      if (code === 0) {
        resolve({ success: true, message: `${modelName} deleted` });
      } else {
        reject({ error: `Delete failed: ${errorOutput || output}` });
      }
    });
  });
};
