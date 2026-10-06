import { app, ipcMain, BrowserWindow } from "electron";
import { exec, spawn } from "child_process";
import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import stripAnsi from "strip-ansi";

export const eventBus = new EventEmitter();

// Log retention: number of days to keep
const LOG_RETENTION_DAYS = 7;

// Resolve the logs folder lazily under userData. The old code used
// `process.cwd()/logs`, which in a packaged install points at the (read-only)
// install dir, so the very first log write threw and could abort startup.
let cleanedOldLogs = false;
function getLogsDir() {
  const logsDir = path.join(app.getPath("userData"), "logs");
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  if (!cleanedOldLogs) {
    cleanedOldLogs = true;
    cleanOldLogs(logsDir);
  }
  return logsDir;
}

// Function to clean old logs
function cleanOldLogs(logsDir) {
  try {
    const files = fs.readdirSync(logsDir);
    const now = Date.now();
    files.forEach((file) => {
      const filePath = path.join(logsDir, file);
      const stats = fs.statSync(filePath);
      const ageDays = (now - stats.mtimeMs) / (1000 * 60 * 60 * 24);
      if (ageDays > LOG_RETENTION_DAYS) {
        fs.unlinkSync(filePath);
      }
    });
  } catch {
    // Non-fatal: logging must never crash setup.
  }
}

// Function to get today's log file path
function getLogFilePath() {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(getLogsDir(), `ollama-${date}.log`);
}

// Append logs to today's file
function writeLogToFile(msg) {
  try {
    const logFilePath = getLogFilePath();
    fs.appendFileSync(logFilePath, msg + "\n", { encoding: "utf8" });
  } catch {
    // Swallow logging errors so they can't take down the app.
  }
}

// Logging function: file only
function log(msg) {
  const timestamp = new Date().toISOString();
  const fullMsg = `[${timestamp}] [Ollama] ${msg}`;
  writeLogToFile(fullMsg);
}

const OLLAMA_HOST = "http://127.0.0.1:11434";
const EMBEDDING_MODEL = "nomic-embed-text:v1.5";

/**
 * True when the Ollama service answers on its local HTTP port. This is the
 * reliable signal: the service is reachable whether or not the `ollama`
 * binary is on this process's PATH, and a desktop app launched from Explorer
 * often inherits a PATH that predates the Ollama install.
 */
async function isOllamaServiceReachable() {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/version`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fallback probe for when HTTP is unreachable. It is what separates "installed
 * but stopped" from "not installed at all", which the two statuses need.
 */
function probeOllamaCli() {
  return new Promise((resolve) => {
    log("Running `ollama --version`...");
    exec("ollama --version", { timeout: 5000 }, (error, stdout, stderr) => {
      if (error) {
        if (stderr) log(stderr);
        return resolve({ installed: false, running: false, output: "" });
      }
      const output = stdout.trim();
      resolve({
        installed: true,
        // The binary exits 0 and prints this warning when the service is down.
        running: !/could not connect to a running Ollama instance/i.test(
          output,
        ),
        output,
      });
    });
  });
}

/**
 * Installed model names, over HTTP when possible and `ollama list` otherwise.
 */
async function listInstalledModels(httpReachable) {
  if (httpReachable) {
    try {
      const res = await fetch(`${OLLAMA_HOST}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.models)) return data.models.map((m) => m.name);
      }
    } catch {
      // Fall through to the CLI.
    }
  }

  return new Promise((resolve, reject) => {
    log("Listing Ollama models...");
    exec("ollama list", (error, stdout, stderr) => {
      if (error) {
        log("Ollama command failed.");
        if (stderr) log(stderr);
        return reject(new Error("Ollama command failed"));
      }
      // Skip the header row; the model name is the first column.
      resolve(
        stdout
          .split("\n")
          .slice(1)
          .map((line) => line.trim().split(/\s+/)[0])
          .filter(Boolean),
      );
    });
  });
}

/**
 * Pull the embedding model through the HTTP API, which is the only option when
 * the service is reachable but the binary is not on PATH. The API streams
 * newline-delimited JSON progress objects.
 */
async function pullEmbeddingModelOverHttp(sendStatus) {
  const res = await fetch(`${OLLAMA_HOST}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, stream: true }),
  });
  if (!res.ok || !res.body) {
    log(`Model pull failed: HTTP ${res.status}`);
    throw new Error("Model pull failed");
  }

  const toMB = (bytes) => Math.round((bytes / 1024 / 1024) * 10) / 10;
  let buffer = "";
  for await (const chunk of res.body) {
    buffer += chunk.toString();
    let newline;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      let evt;
      try {
        evt = JSON.parse(line);
      } catch {
        continue; // A partial line; the next chunk completes it.
      }
      if (evt.error) {
        log(`Model pull failed: ${evt.error}`);
        throw new Error("Model pull failed");
      }
      if (evt.total && evt.completed) {
        sendStatus({
          type: "downloading",
          percent: Math.round((evt.completed / evt.total) * 100),
          downloadedMB: toMB(evt.completed),
          totalMB: toMB(evt.total),
        });
      }
      if (evt.status) log(evt.status);
    }
  }
  sendStatus({ type: "downloaded" });
  log("Model pull process finished.");
}

export function OllamaEmbeddingModelSetup() {
  const sendStatus = (status) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      win.webContents.send("status-update", status);
    }
    eventBus.emit("status-update", status);
  };

  /** Pull the embedding model with the CLI, for when HTTP is unreachable. */
  async function pullEmbeddingModelWithCli() {
    await new Promise((resolve, reject) => {
      const ollamaProcess = spawn("ollama", ["pull", "nomic-embed-text:v1.5"]);

      ollamaProcess.stderr.on("data", (data) => {
        let text = data.toString();

        // Remove ANSI escape codes
        text = stripAnsi(text);

        // Remove carriage returns and extra whitespace
        text = text.replace(/\r/g, "").trim();

        if (!text) return;

        log(text);

        // Match progress like "7% ... 18 MB/274 MB"
        const progressMatch = text.match(
          /(\d+)%.*?(\d+(?:\.\d+)?)\s*MB\/(\d+(?:\.\d+)?)\s*MB/,
        );
        if (progressMatch) {
          const percent = parseInt(progressMatch[1], 10);
          const downloadedMB = parseFloat(progressMatch[2]);
          const totalMB = parseFloat(progressMatch[3]);

          sendStatus({
            type: "downloading",
            percent,
            downloadedMB,
            totalMB,
          });
        }

        if (text.toLowerCase().includes("success")) {
          sendStatus({ type: "downloaded" });
        }
      });

      ollamaProcess.stderr.on("data", (data) => {
        const text = data.toString().trim();
        if (text) log(text);
      });

      ollamaProcess.on("close", (code) => {
        if (code === 0) {
          log("Model pull process finished.");
          resolve();
        } else {
          log(`Model pull failed with code ${code}`);
          sendStatus({ type: "error" });
          reject(new Error("Model pull failed"));
        }
      });
    });
  }

  async function checkOllama() {
    log("Starting system status check...");

    try {
      // Detect over HTTP first, and only fall back to the CLI. `ollama
      // --version` failing means nothing more than "the binary is not on this
      // process's PATH", which is routinely true of a working install, and
      // treating that as proof of absence is what put a red "Ollama not found"
      // rocket in the title bar of machines with Ollama up and answering.
      const httpReachable = await isOllamaServiceReachable();
      if (httpReachable) {
        log("Ollama HTTP API is reachable; Ollama is installed and running.");
      } else {
        log("Ollama HTTP API unreachable; falling back to the CLI probe.");
        const cli = await probeOllamaCli();
        if (!cli.installed) {
          log("Ollama not installed.");
          throw new Error("Ollama not installed");
        }
        log(`Ollama --version output: ${cli.output}`);
        if (!cli.running) {
          log("Ollama is installed but not running.");
          throw new Error("Ollama not running");
        }
        log("Ollama is installed and running.");
      }

      const models = await listInstalledModels(httpReachable);
      log("Available models:\n" + models.join("\n"));
      const modelPulled = models.includes(EMBEDDING_MODEL);
      log(
        modelPulled
          ? "Embedding model is available."
          : "Embedding model not pulled.",
      );

      // Auto-pull model if missing
      if (!modelPulled) {
        log("Automatically pulling embedding model...");
        sendStatus({
          type: "downloading",
          percent: 0,
          downloadedMB: 0,
          totalMB: 0,
        });
        if (httpReachable) {
          await pullEmbeddingModelOverHttp(sendStatus);
        } else {
          await pullEmbeddingModelWithCli();
        }
      }

      log("System ready.");
      sendStatus({ type: "system-ready" });
    } catch (error) {
      log(`Status check error: ${error.message}`);

      if (error.message.includes("Ollama not installed")) {
        sendStatus({ type: "ollama-not-installed" });
      } else if (error.message.includes("Ollama not running")) {
        sendStatus({ type: "ollama-not-running" });
      } else if (error.message.includes("Model pull failed")) {
        sendStatus({ type: "pull-failure" });
      } else {
        sendStatus({ type: "error" });
      }
    }
  }

  // IPC listeners
  ipcMain.on("check-status", () => checkOllama());
  ipcMain.on("pull-model", async () => {
    try {
      log("Manual model pull requested...");
      await checkOllama();
    } catch (err) {
      log(err.message);
    }
  });

  // Run status check on startup
  checkOllama();
}
