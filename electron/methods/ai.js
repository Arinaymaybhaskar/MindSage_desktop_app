// IPC for the AI client: which provider runs, how the built-in engine stands,
// and downloading its models. The setup and settings screens build on these.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { BrowserWindow } from "electron";
import { modelStore } from "../store.js";
import { log } from "../log.js";
import { PROVIDERS, activeProvider } from "../ai/client.js";
import * as builtin from "../ai/llama.js";
import { BUILTIN_MODELS } from "../ai/models.js";
import {
  deleteImpact,
  downloadSpace,
  downloadWarning,
  formatGB,
  isLockedError,
  modelBars,
  recommend,
} from "../ai/picker.js";
import { downloadFile } from "../ai/download.js";
import * as queue from "../ai/queue.js";
import { createRestarter } from "../ai/restart.js";

const PROGRESS_EVERY_MS = 250;
let downloading = null; // { id, done, total }
let cancelDownload = null;
let downloadEnded = null; // resolves when the running download's handler returns
let pausedId = null; // set while a restart holds the download

export async function handleGetAIStatus() {
  return {
    provider: activeProvider(),
    ...(await builtin.status()),
    downloading,
    restart: restarter.getStatus(),
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
  const space = downloadSpace(id, freeDiskBytes(id), partBytes(id));
  if (space.short > 0) {
    return {
      error: `Not enough disk space: free ${formatGB(space.short)} more.`,
      notEnoughSpace: true,
    };
  }
  if (downloading) return { error: "Another model is downloading" };
  downloading = { id, done: 0, total: spec.bytes };
  let endDownload;
  downloadEnded = new Promise((resolve) => (endDownload = resolve));
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
    if (pausedId === id) {
      broadcast({
        id,
        paused: true,
        done: downloading.done,
        total: spec.bytes,
      });
      return { paused: true };
    }
    const cancelled = controller.signal.aborted;
    const error = cancelled ? "Download cancelled" : err.message;
    log.warn("Built-in AI model download stopped", { id, error });
    broadcast({ id, error, cancelled });
    return { error, cancelled };
  } finally {
    downloading = null;
    cancelDownload = null;
    endDownload();
  }
}

const restarter = createRestarter({
  provider: activeProvider,
  reloadBuiltin: builtin.restart,
  ollamaRunning: () =>
    fetch("http://127.0.0.1:11434/api/version", {
      signal: AbortSignal.timeout(2000),
    }).then(
      (res) => res.ok,
      () => false,
    ),
  queue,
  // The .part stays, so the download picks up where it stopped.
  async pauseDownload() {
    if (!downloading) return null;
    pausedId = downloading.id;
    cancelDownload();
    await downloadEnded;
    return pausedId;
  },
  resumeDownload(id) {
    pausedId = null;
    handleDownloadAIModel(null, id, true);
  },
  onChange: (status) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send("ai:restart-status", status);
    }
  },
  log,
});

/** Restarts the local AI; a press while it restarts returns the current status. */
export const handleRestartAI = () => restarter.restart();

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

function partBytes(id) {
  try {
    return fs.statSync(`${builtin.modelPath(id)}.part`).size;
  } catch {
    return 0;
  }
}

/** Free bytes on the disk the models live on; Infinity when it cannot be read. */
function freeDiskBytes(id) {
  try {
    const dir = path.dirname(builtin.modelPath(id));
    fs.mkdirSync(dir, { recursive: true });
    const st = fs.statfsSync(dir);
    return st.bavail * st.bsize;
  } catch (err) {
    log.warn("Free disk space could not be read", { error: err.message });
    return Infinity;
  }
}

/**
 * Everything a download or delete dialog shows, read fresh each call so the
 * dialog can poll: disk space changes while it is open.
 * shortcut: no metered-connection check, Electron has no cheap API for it.
 */
export function handleGetModelDialog(_event, id) {
  if (typeof id !== "string" || !Object.hasOwn(BUILTIN_MODELS, id)) {
    return { error: "Unknown model" };
  }
  const spec = BUILTIN_MODELS[id];
  const space = downloadSpace(id, freeDiskBytes(id), partBytes(id));
  return {
    id,
    label: spec.label,
    size: formatGB(spec.bytes),
    downloaded: builtin.isDownloaded(id),
    needSize: formatGB(space.need),
    freeSize: Number.isFinite(space.free) ? formatGB(space.free) : null,
    shortSize: space.short > 0 ? formatGB(space.short) : null,
    enoughSpace: space.short === 0,
    memoryWarning: downloadWarning(id, os.totalmem()),
    impact: deleteImpact(id, builtin.chatModelId(), builtin.isDownloaded),
  };
}

/**
 * Deletes a downloaded model. One in use needs `confirmed`; chat then moves
 * to another downloaded chat model, or is left off (chatModel null).
 */
export async function handleDeleteAIModel(_event, id, confirmed = false) {
  if (typeof id !== "string" || !Object.hasOwn(BUILTIN_MODELS, id)) {
    return { error: "Unknown model" };
  }
  if (downloading?.id === id) return { error: "That model is downloading" };
  const impact = deleteImpact(id, builtin.chatModelId(), builtin.isDownloaded);
  if (impact.inUse && confirmed !== true) {
    return { error: impact.warning, needsConfirm: true };
  }
  await builtin.unloadAll();
  try {
    fs.rmSync(builtin.modelPath(id), { force: true });
  } catch (err) {
    log.warn("Built-in AI model could not be deleted", {
      id,
      error: err.message,
    });
    return isLockedError(err)
      ? { error: "The file is in use by another program.", retryLater: true }
      : { error: err.message };
  }
  if (BUILTIN_MODELS[id].role === "chat" && impact.inUse)
    modelStore.set("builtinModels", {
      ...modelStore.get("builtinModels"),
      chat: impact.alternative,
    });
  lastProbe = lastProbe?.id === id ? null : lastProbe;
  return {
    success: true,
    chatModel:
      BUILTIN_MODELS[id].role === "chat" ? impact.alternative : undefined,
  };
}
