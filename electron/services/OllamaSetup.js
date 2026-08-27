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
        files.forEach(file => {
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

export function OllamaEmbeddingModelSetup() {

    const sendStatus = (status) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) {
            win.webContents.send("status-update", status);
        }
        eventBus.emit("status-update", status);
    };

    async function checkOllama() {
        log("Starting system status check...");

        try {
            // Check Ollama installation
            await new Promise((resolve, reject) => {
                log("Running `ollama --version`...");
                exec("ollama --version", (error, stdout, stderr) => {
                    if (error) {
                        log("Ollama not installed.");
                        if (stderr) log(stderr);
                        return reject(new Error("Ollama not installed"));
                    }

                    const output = stdout.trim();
                    log(`Ollama --version output: ${output}`);

                    if (/could not connect to a running Ollama instance/i.test(output)) {
                        log("Ollama is installed but not running.");
                        return reject(new Error("Ollama not running"));
                    }

                    log("Ollama is installed and running.");
                    log(`Version: ${output}`);
                    resolve();
                });
            });


            // Check if embedding model is pulled
            const modelPulled = await new Promise((resolve, reject) => {
                log("Listing Ollama models...");
                exec("ollama list", (error, stdout, stderr) => {
                    if (error) {
                        log("Ollama command failed.");
                        if (stderr) log(stderr);
                        return reject(new Error("Ollama command failed"));
                    }
                    log("Available models:\n" + stdout);

                    if (!stdout.includes("nomic-embed-text:v1.5")) {
                        log("Embedding model not pulled.");
                        return resolve(false);
                    }

                    log("Embedding model is available.");
                    resolve(true);
                });
            });

            // Auto-pull model if missing
            if (!modelPulled) {
                log("Automatically pulling embedding model...");
                sendStatus({ type: "downloading", percent: 0, downloadedMB: 0, totalMB: 0 });
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
                        const progressMatch = text.match(/(\d+)%.*?(\d+(?:\.\d+)?)\s*MB\/(\d+(?:\.\d+)?)\s*MB/);
                        if (progressMatch) {
                            const percent = parseInt(progressMatch[1], 10);
                            const downloadedMB = parseFloat(progressMatch[2]);
                            const totalMB = parseFloat(progressMatch[3]);

                            sendStatus({ type: "downloading", percent, downloadedMB, totalMB });
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

            log("System ready.");
            sendStatus({ type: "system-ready" });

        } catch (error) {
            log(`Status check error: ${error.message}`);

            if (error.message.includes("Ollama not installed")) {
                sendStatus({ type: "ollama-not-installed" });
            } else if (error.message.includes("Ollama not running")) {
                sendStatus({ type: "ollama-not-running" });  // <-- new status
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
