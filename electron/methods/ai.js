// IPC for the AI client: which provider runs, how the built-in engine stands,
// and downloading its models. The setup and settings screens build on these.
import fs from "node:fs";
import os from "node:os";
import { BrowserWindow } from "electron";
import { modelStore } from "../store.js";
import { log } from "../log.js";
import { PROVIDERS, activeProvider } from "../ai/client.js";
import * as builtin from "../ai/llama.js";
import { BUILTIN_MODELS } from "../ai/models.js";
import { downloadWarning, modelBars, recommend } from "../ai/picker.js";
import { downloadFile } from "../ai/download.js";

const PROGRESS_EVERY_MS = 250;
let downloading = null; // { id, done, total }
let cancelDownload = null;

export async function handleGetAIStatus() {
  return {
    provider: activeProvider(),
    ...(await builtin.status()),
    downloading,
  };
}

export async function handleSetAIProvider(_event, provider) {
  if (!PROVIDERS.includes(provider)) return { error: "Unknown provider" };
  modelStore.set("aiProvider", provider);
  if (provider === "ollama") await builtin.unloadAll();
  return { success: true };
}

function broadcast(progress) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed())
      win.webContents.send("ai:download-progress", progress);
  }
}

/** Downloads one built-in model; resumes a cut download and checks its SHA-256. */
export async function handleDownloadAIModel(_event, id, confirmed = false) {
  if (typeof id !== "string" || !Object.hasOwn(BUILTIN_MODELS, id)) {
    return { error: "Unknown model" };
  }
  const warning = downloadWarning(id, os.totalmem());
  if (warning && confirmed !== true) {
    return { error: warning, needsConfirm: true };
  }
  const spec = BUILTIN_MODELS[id];
  if (downloading) return { error: "Another model is downloading" };
  downloading = { id, done: 0, total: spec.bytes };
  const controller = new AbortController();
  cancelDownload = () => controller.abort();
  let sentAt = 0;
  try {
    await downloadFile({
      url: spec.url,
      dest: builtin.modelPath(id),
      sha256: spec.sha256,
      signal: controller.signal,
      onProgress: ({ done, total }) => {
        downloading = { id, done, total };
        if (Date.now() - sentAt < PROGRESS_EVERY_MS) return;
        sentAt = Date.now();
        broadcast(downloading);
      },
    });
    log.info("Built-in AI model downloaded", { id });
    broadcast({ id, done: spec.bytes, total: spec.bytes, finished: true });
    return { success: true };
  } catch (err) {
    const cancelled = controller.signal.aborted;
    const error = cancelled ? "Download cancelled" : err.message;
    log.warn("Built-in AI model download stopped", { id, error });
    broadcast({ id, error, cancelled });
    return { error, cancelled };
  } finally {
    downloading = null;
    cancelDownload = null;
  }
}

/** Stops the running download; its .part stays, so the next try resumes. */
export function handleCancelAIDownload() {
  if (!cancelDownload) return { error: "No download is running" };
  cancelDownload();
  return { success: true };
}

const PROBE_MS = 5000;
let lastProbe = null; // { id, tokensPerSecond }, null when it failed or has not run

/** Everything the picker screen shows; bars come from the last speed probe. */
export function handleGetModelPicker() {
  const total = os.totalmem();
  return {
    totalMemBytes: total,
    recommendation: recommend(total),
    selected: builtin.chatModelId(),
    probed: lastProbe !== null,
    models: modelBars(total, lastProbe, builtin.isDownloaded),
  };
}

/**
 * Generates for 5 seconds on the chat model and measures tokens per second
 * from the first token (the model load is not speed). Any failure leaves no
 * speeds: the bars hide and the recommendation stays on memory alone.
 */
export async function handleProbeAISpeed() {
  lastProbe = null;
  const id = builtin.chatModelId();
  if (activeProvider() === "builtin" && builtin.isDownloaded(id)) {
    try {
      const controller = new AbortController();
      let first = 0;
      let tokens = 0;
      const timer = setTimeout(() => controller.abort(), PROBE_MS);
      try {
        await builtin.generate("Write a long story about a quiet harbour.", {
          model: id,
          maxTokens: 400,
          temperature: 0.8,
          signal: controller.signal,
          onToken: () => {
            first ||= Date.now();
            tokens++;
          },
        });
      } catch (err) {
        if (!controller.signal.aborted) throw err; // the cut-off is the test
      } finally {
        clearTimeout(timer);
      }
      const seconds = (Date.now() - first) / 1000;
      if (first && tokens > 1 && seconds > 0) {
        lastProbe = { id, tokensPerSecond: tokens / seconds };
      }
    } catch (err) {
      log.warn("AI speed probe failed", { id, error: err.message });
    }
  }
  return handleGetModelPicker();
}

/** Chooses the chat model; it takes effect once its file is on disk. */
export function handleSelectAIModel(_event, id) {
  if (BUILTIN_MODELS[id]?.role !== "chat") return { error: "Unknown model" };
  modelStore.set("builtinModels", {
    ...modelStore.get("builtinModels"),
    chat: id,
  });
  return { success: true };
}

/** Deletes a downloaded model; if it was the chosen one, the recommendation takes over. */
export async function handleDeleteAIModel(_event, id) {
  if (typeof id !== "string" || !Object.hasOwn(BUILTIN_MODELS, id)) {
    return { error: "Unknown model" };
  }
  if (downloading?.id === id) return { error: "That model is downloading" };
  await builtin.unloadAll();
  try {
    fs.rmSync(builtin.modelPath(id), { force: true });
  } catch (err) {
    log.warn("Built-in AI model could not be deleted", {
      id,
      error: err.message,
    });
    return { error: err.message };
  }
  const chosen = modelStore.get("builtinModels");
  if (chosen?.chat === id)
    modelStore.set("builtinModels", { ...chosen, chat: null });
  lastProbe = lastProbe?.id === id ? null : lastProbe;
  return { success: true, chatModel: builtin.chatModelId() };
}
