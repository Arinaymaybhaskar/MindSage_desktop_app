// IPC for the Advanced setup (KAN-79): check and choose the AI provider
// (Ollama, an OpenAI-compatible server such as LM Studio, or a .gguf file).
// The renderer sends no path: the .gguf comes from a file dialog opened here
// and is held in this process until the choice is applied.
import path from "node:path";
import { BrowserWindow, dialog } from "electron";
import { modelStore } from "../store.js";
import { log } from "../log.js";
import { activeProvider } from "../ai/client.js";
import { checkGguf } from "../ai/gguf.js";
import { settings } from "../ai/openai.js";
import { cleanOpenai, validateProvider } from "../ai/providers.js";
import * as builtin from "../ai/llama.js";

let pendingGguf = null; // a file the owner picked in the dialog, not yet applied

export function handleGetProviderConfig() {
  const saved = modelStore.get("ggufPath");
  return {
    provider: activeProvider(),
    openai: cleanOpenai(settings()),
    gguf: saved ? path.basename(saved) : null,
  };
}

/** The file dialog; a refused file is reported, never kept. */
export async function handlePickGguf(event) {
  const win = BrowserWindow.fromWebContents(event.sender);
  const picked = await dialog.showOpenDialog(win, {
    title: "Choose a .gguf model",
    properties: ["openFile"],
    filters: [{ name: "GGUF model", extensions: ["gguf"] }],
  });
  if (picked.canceled || !picked.filePaths[0]) return { canceled: true };
  const checked = checkGguf(picked.filePaths[0]);
  pendingGguf = checked.ok ? checked.path : null;
  return checked.ok
    ? { ok: true, name: checked.name, bytes: checked.bytes }
    : checked;
}

const configFor = (kind, config) =>
  kind === "gguf" ? { path: pendingGguf } : config;

/** Validates without saving; the retry button calls this again. */
export function handleCheckProvider(_event, kind, config) {
  return validateProvider(kind, configFor(kind, config));
}

/** Validates, then saves and switches. Nothing changes when the check fails. */
export async function handleApplyProvider(_event, kind, config) {
  const result = await validateProvider(kind, configFor(kind, config));
  if (!result.ok) return { error: result.error };
  if (kind === "openai") modelStore.set("openaiCompat", cleanOpenai(config));
  if (kind === "gguf") modelStore.set("ggufPath", pendingGguf);
  modelStore.set("aiProvider", kind);
  // The engine reloads on the next call, so a replaced file is picked up.
  await builtin.unloadAll();
  log.info("AI provider changed", { provider: kind });
  return { success: true };
}
