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
  const spec = BUILTIN_MODELS[id];
  if (!spec) return { error: "Unknown model" };
  if (downloading) return { error: "Another model is downloading" };
  downloading = { id, done: 0, total: spec.bytes };
  let sentAt = 0;
  try {
    await downloadFile({
      url: spec.url,
      dest: builtin.modelPath(id),
      sha256: spec.sha256,
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
    log.warn("Built-in AI model download failed", { id, error: err.message });
    broadcast({ id, error: err.message });
    return { error: err.message };
  } finally {
    downloading = null;
  }
}
