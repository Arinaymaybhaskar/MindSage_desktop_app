// IPC for the AI client: which provider runs, how the built-in engine stands,
// and downloading its models. The setup and settings screens build on these.
import { BrowserWindow } from "electron";
import { modelStore } from "../store.js";
import { log } from "../log.js";
import { PROVIDERS, activeProvider } from "../ai/client.js";
import * as builtin from "../ai/llama.js";
import { BUILTIN_MODELS } from "../ai/models.js";
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
export async function handleDownloadAIModel(_event, id) {
  if (typeof id !== "string" || !Object.hasOwn(BUILTIN_MODELS, id)) {
    return { error: "Unknown model" };
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
