// IPC for local AI setup states (KAN-78, KAN-87): wires the pure state machine
// in ai/setupState.js to the shared downloader in methods/ai.js. Setup runs in
// the background; no handler here waits on it, and writing never depends on it.
// Download progress stays on the existing ai:download-progress event.
import os from "node:os";
import { BrowserWindow, ipcMain } from "electron";
import { modelStore } from "../store.js";
import { log } from "../log.js";
import { eventBus } from "../eventBus.js";
import * as builtin from "../ai/llama.js";
import { BUILTIN_MODELS, EMBED_MODEL } from "../ai/models.js";
import { createSetup, checkReachable } from "../ai/setupState.js";
import {
  clearPause,
  freeDiskBytes,
  handleDownloadAIModel,
  partBytes,
  pauseDownload,
} from "./ai.js";

const ASKED = "aiSetupMeteredWaitForWifi";
const WANTED = "aiSetupWanted";
// Only an explicit choice of Ollama keeps setup on Ollama.
const provider = () =>
  modelStore.get("aiProvider") === "ollama" ? "ollama" : "builtin";

const setup = createSetup({
  provider,
  plan: () =>
    [EMBED_MODEL, builtin.chatModelId()].filter(
      (id) => !builtin.isDownloaded(id),
    ),
  chatId: builtin.chatModelId,
  totalMem: os.totalmem,
  freeDisk: freeDiskBytes,
  partBytes,
  download: (id) => {
    clearPause();
    return handleDownloadAIModel(null, id, true);
  },
  pauseDownload,
  reachable: (url) => checkReachable(url),
  // The host the file really comes from, not a stand-in.
  hostFor: (id) => new URL(BUILTIN_MODELS[id].url).origin,
  // Ollama's own setup listens for this and pulls the embedding model.
  pullOllama: () => ipcMain.emit("pull-model"),
  asked: {
    get: () => modelStore.get(ASKED),
    set: (v) => modelStore.set(ASKED, v),
  },
  onReady() {
    builtin.warmUp();
    // Entries written while the models were missing failed enrichment; retry them.
    eventBus.emit("ai:models-ready");
  },
  onChange: (state) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send("ai:setup-state", state);
    }
  },
  log,
});

export const handleGetSetupState = () => setup.getState();

export function handleStartSetup(_event, options = {}) {
  modelStore.set(WANTED, true);
  // Not awaited: the caller gets the state at once and the rest arrives as events.
  setup.start({ confirmed: options?.confirmed === true });
  return setup.getState();
}

export const handlePauseSetup = () => setup.pause();
export const handleAnswerMetered = (_event, waitForWifi) =>
  setup.answerMetered(waitForWifi === true);
export const handleSetupOnline = () => setup.online();

/** Launch: a setup the user already began picks up where it stopped. */
export function resumeSetupOnLaunch() {
  if (modelStore.get(WANTED) === true) setup.start({ auto: true });
}
