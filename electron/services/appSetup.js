// appSetup.js
//
// First-run setup orchestration for the local AI stack (Ollama + models).
//
// Design notes:
// - The app talks to Ollama over its local HTTP API (127.0.0.1:11434), NOT the
//   CLI, wherever possible. After a fresh install the Ollama *service* is
//   already running and reachable over HTTP even though the current process's
//   PATH hasn't picked up the `ollama` binary yet, so HTTP detection is the
//   only reliable signal right after an auto-install.
// - Model policy (per product decision): the embedding model is REQUIRED and
//   pulled automatically (small, needed for search/enrichment). A generation
//   model is NEVER force-downloaded. We recommend a size-appropriate model
//   based on the machine's RAM and let the user choose to pull it (or a small
//   default they can delete later), because every machine has different specs.

import { app, ipcMain, BrowserWindow, shell } from "electron";
import { exec, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const OLLAMA_HOST = "http://127.0.0.1:11434";
const EMBEDDING_MODEL = "nomic-embed-text:v1.5";
// The small, deletable default generation model we offer during onboarding.
const SMALL_GENERATION_MODEL = "llama3.2:1b";
const OLLAMA_WINDOWS_INSTALLER = "https://ollama.com/download/OllamaSetup.exe";
const OLLAMA_DOWNLOAD_PAGE = "https://ollama.com/download";

// ---------- progress plumbing ----------

function sendToRenderer(channel, payload) {
  const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
  if (win) win.webContents.send(channel, payload);
}

function emitProgress(phase, patch = {}) {
  sendToRenderer("setup:progress", { phase, ...patch });
}

// ---------- Ollama detection ----------

async function isOllamaRunning() {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/version`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function isOllamaOnPath() {
  return new Promise((resolve) => {
    exec("ollama --version", { timeout: 5000 }, (error) => resolve(!error));
  });
}

async function listInstalledModels() {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.models)
      ? data.models.map((m) => ({ name: m.name, size: m.size }))
      : [];
  } catch {
    return [];
  }
}

/** A "generation" model is any installed model that isn't the embedding model. */
function hasGenerationModel(models) {
  return models.some((m) => !/embed/i.test(m.name));
}

function hasModel(models, name) {
  // Ollama reports names with an implicit ":latest" tag; match loosely.
  const base = name.split(":")[0];
  return models.some((m) => m.name === name || m.name.split(":")[0] === base);
}

// ---------- system-spec model recommendation ----------

/**
 * Recommend a generation model sized to the machine. RAM is the primary,
 * portable signal (GPU VRAM detection is unreliable across Windows setups, so
 * we bias conservative). The user can always override.
 */
function recommendGenerationModel() {
  const ramGB = os.totalmem() / 1024 ** 3;

  let model, label, sizeGB;
  if (ramGB < 6) {
    model = "llama3.2:1b";
    label = "Llama 3.2 1B";
    sizeGB = 1.3;
  } else if (ramGB < 16) {
    model = "llama3.2:3b";
    label = "Llama 3.2 3B";
    sizeGB = 2.0;
  } else if (ramGB < 32) {
    model = "llama3.1:8b";
    label = "Llama 3.1 8B";
    sizeGB = 4.7;
  } else {
    model = "llama3.1:8b";
    label = "Llama 3.1 8B";
    sizeGB = 4.7;
  }

  return {
    model,
    label,
    sizeGB,
    systemRamGB: Math.round(ramGB * 10) / 10,
    smallDefault: SMALL_GENERATION_MODEL,
    reason: `Chosen to run comfortably on your ~${Math.round(ramGB)} GB of RAM. You can pick a different model anytime in Settings.`,
  };
}

// ---------- aggregate status ----------

async function getSetupStatus() {
  const running = await isOllamaRunning();
  const installed = running || (await isOllamaOnPath());
  const models = running ? await listInstalledModels() : [];

  return {
    ollamaInstalled: installed,
    ollamaRunning: running,
    embeddingReady: hasModel(models, EMBEDDING_MODEL),
    generationReady: hasGenerationModel(models),
    models,
    recommended: recommendGenerationModel(),
    platform: process.platform,
  };
}

// ---------- Ollama auto-install (Windows) ----------

async function downloadFile(url, destPath, onProgress) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new Error(`Download failed: HTTP ${res.status}`);
  }
  const total = Number(res.headers.get("content-length")) || 0;
  let received = 0;

  const fileStream = fs.createWriteStream(destPath);
  for await (const chunk of res.body) {
    received += chunk.length;
    fileStream.write(chunk);
    if (onProgress) {
      const percent = total ? Math.round((received / total) * 100) : 0;
      onProgress(percent, received, total);
    }
  }
  await new Promise((resolve, reject) => {
    fileStream.end(resolve);
    fileStream.on("error", reject);
  });
}

/**
 * Download + silently run the official Ollama installer on Windows. Returns
 * once the Ollama HTTP service becomes reachable. Falls back to opening the
 * download page in the browser on any failure so the user is never stuck.
 */
async function installOllama() {
  if (process.platform !== "win32") {
    // Auto-install is Windows-only; guide everyone else to the download page.
    await shell.openExternal(OLLAMA_DOWNLOAD_PAGE);
    return { success: false, guided: true, reason: "auto-install-unsupported" };
  }

  const installerPath = path.join(app.getPath("temp"), "OllamaSetup.exe");

  try {
    emitProgress("installing-ollama", { step: "downloading", percent: 0 });
    await downloadFile(OLLAMA_WINDOWS_INSTALLER, installerPath, (percent) => {
      emitProgress("installing-ollama", { step: "downloading", percent });
    });

    emitProgress("installing-ollama", {
      step: "running-installer",
      percent: 100,
    });
    await new Promise((resolve, reject) => {
      // Ollama's installer is Inno Setup; these flags run it unattended.
      const proc = spawn(
        installerPath,
        ["/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART"],
        {
          windowsVerbatimArguments: true,
        },
      );
      proc.on("error", reject);
      proc.on("close", (code) => {
        // Some installer builds exit non-zero even on success; verify via
        // the service below rather than trusting the exit code alone.
        resolve(code);
      });
    });

    emitProgress("installing-ollama", { step: "starting-service" });
    const ready = await waitForOllama(60000);
    if (!ready) throw new Error("Ollama service did not start after install");

    emitProgress("installing-ollama", { step: "done" });
    return { success: true };
  } catch (err) {
    // Fallback: hand the user the official installer manually.
    try {
      if (fs.existsSync(installerPath)) await shell.openPath(installerPath);
      else await shell.openExternal(OLLAMA_DOWNLOAD_PAGE);
    } catch {
      await shell.openExternal(OLLAMA_DOWNLOAD_PAGE);
    }
    emitProgress("installing-ollama", {
      step: "manual-fallback",
      error: err.message,
    });
    return { success: false, guided: true, reason: err.message };
  }
}

async function waitForOllama(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isOllamaRunning()) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

/** Start `ollama serve` when installed-but-stopped. Best-effort (needs PATH). */
async function startOllama() {
  if (await isOllamaRunning()) return { success: true, alreadyRunning: true };
  try {
    const proc = spawn("ollama", ["serve"], {
      detached: true,
      stdio: "ignore",
    });
    proc.unref();
  } catch {
    // PATH may not include ollama in this process; the service may still be
    // starting on its own. Fall through to the readiness poll.
  }
  const ready = await waitForOllama(20000);
  return { success: ready };
}

// ---------- model pulling with progress ----------

async function pullModel(modelName) {
  if (!(await isOllamaRunning())) {
    return { success: false, error: "Ollama is not running" };
  }
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelName, stream: true }),
    });
    if (!res.ok || !res.body) {
      throw new Error(`Ollama pull failed: HTTP ${res.status}`);
    }

    let buffer = "";
    for await (const chunk of res.body) {
      buffer += chunk.toString();
      // The pull API streams newline-delimited JSON objects.
      let nl;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          const evt = JSON.parse(line);
          if (evt.error) throw new Error(evt.error);
          const percent =
            evt.total && evt.completed
              ? Math.round((evt.completed / evt.total) * 100)
              : undefined;
          emitProgress("pulling-model", {
            model: modelName,
            status: evt.status,
            percent,
          });
        } catch (parseErr) {
          if (
            parseErr.message &&
            parseErr.message !== "Unexpected end of JSON input"
          ) {
            // A real pull error (e.g. model not found): surface it.
            if (!/JSON/.test(parseErr.message)) throw parseErr;
          }
        }
      }
    }
    emitProgress("pulling-model", {
      model: modelName,
      status: "success",
      percent: 100,
    });
    return { success: true };
  } catch (err) {
    emitProgress("pulling-model", {
      model: modelName,
      status: "error",
      error: err.message,
    });
    return { success: false, error: err.message };
  }
}

async function deleteModel(modelName) {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/delete`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelName }),
    });
    return { success: res.ok };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ---------- IPC registration ----------

let registered = false;

export function registerSetupIPC() {
  if (registered) return;
  registered = true;

  ipcMain.handle("setup:get-status", () => getSetupStatus());
  ipcMain.handle("setup:install-ollama", () => installOllama());
  ipcMain.handle("setup:start-ollama", () => startOllama());
  ipcMain.handle("setup:pull-model", (_e, modelName) => pullModel(modelName));
  ipcMain.handle("setup:delete-model", (_e, modelName) =>
    deleteModel(modelName),
  );
  ipcMain.handle("setup:recommend-model", () => recommendGenerationModel());

  // Pull the required embedding model automatically once Ollama is up.
  ipcMain.handle("setup:ensure-embedding", async () => {
    const models = await listInstalledModels();
    if (hasModel(models, EMBEDDING_MODEL))
      return { success: true, alreadyPresent: true };
    return pullModel(EMBEDDING_MODEL);
  });
}

export {
  getSetupStatus,
  installOllama,
  startOllama,
  pullModel,
  recommendGenerationModel,
  EMBEDDING_MODEL,
  SMALL_GENERATION_MODEL,
};
