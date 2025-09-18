// main.js
import { app, BrowserWindow, globalShortcut, ipcMain } from "electron";
import path, { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import localDB from "./db/index.js";
// import { startServer } from "../src/server/app.js";
import { createWindow } from "./windowManager.js";
import { registerIPCHandlers } from "./ipcHandlers.js";
import { setupEventBusListeners } from "./events.js";
import { startQdrant, stopQdrant } from "./services/qdrantManager.js";
import { OllamaEmbeddingModelSetup } from "./services/OllamaSetup.js";
import { Worker } from "node:worker_threads";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.env.DIST = path.join(__dirname, "../dist");
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(__dirname, "../public")
  : process.env.DIST;

let win;
let quickCaptureWindow;

function openQuickCaptureWindow() {
  if (quickCaptureWindow) {
    quickCaptureWindow.focus();
    return;
  }

  quickCaptureWindow = new BrowserWindow({
    title: "QuickCapture",
    width: 500,
    height: 400,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const url = process.env.VITE_DEV_SERVER_URL
    ? `${process.env.VITE_DEV_SERVER_URL}#/quick-capture`
    : `file://${path.join(process.env.DIST, "index.html")}#/quick-capture`;

  console.log("Loading QuickCapture URL:", url);
  quickCaptureWindow.loadURL(url);

  if (process.env.VITE_DEV_SERVER_URL) {
    quickCaptureWindow.webContents.openDevTools({ mode: "detach" });
  }

  quickCaptureWindow.once("ready-to-show", () => {
    if (!quickCaptureWindow.isDestroyed()) quickCaptureWindow.show();
  });

  // 🔑 Close on ESC
  quickCaptureWindow.webContents.on("before-input-event", (_event, input) => {
    if (input.key === "Escape") {
      if (!quickCaptureWindow.isDestroyed()) {
        quickCaptureWindow.close();
      }
    }
  });

  quickCaptureWindow.on("closed", () => {
    quickCaptureWindow = null;
  });
}



// ------------------- Qdrant Worker -------------------
function createQdrantWorker() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  const isDev = !app.isPackaged;

  const workerPath = isDev
    ? path.join(__dirname, "qdrantWorker.js")
    : path.join(process.resourcesPath, "dist-electron", "qdrantWorker.js");

  const worker = new Worker(workerPath, { type: "module" });

  worker.on("message", (message) => console.log("Qdrant Worker Message:", message));
  worker.on("error", (error) => console.error("Qdrant Worker Error:", error));
  worker.on("exit", (code) => {
    if (code !== 0) console.error(`Qdrant Worker stopped with exit code ${code}`);
    else console.log("Qdrant worker exited successfully");
  });
  worker.on("online", () => console.log("Qdrant worker is online"));

  global.qdrantWorker = worker;

  return worker;
}

// ------------------- App Ready -------------------
app.whenReady().then(async () => {
  localDB.initDatabase();
  OllamaEmbeddingModelSetup();
  const runtime = await startQdrant();
  registerIPCHandlers(runtime);
  setupEventBusListeners();
  createQdrantWorker();
  win = await createWindow();

  // ------------------- Global Shortcut -------------------
  const shortcut =
    process.platform === "darwin" ? "Command+Option+Space" : "Control+Alt+Space";

  const registered = globalShortcut.register(shortcut, () => {
    console.log("QuickCapture triggered!");
    openQuickCaptureWindow();
  });

  ipcMain.handle("quick-capture:close", () => {
    if (quickCaptureWindow && !quickCaptureWindow.isDestroyed()) {
      quickCaptureWindow.close();
      quickCaptureWindow = null; // reset reference
    }
  });

  if (!registered) console.log("Failed to register QuickCapture global shortcut");

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Enable launch at startup
app.setLoginItemSettings({
  openAtLogin: true, // Launch at startup
  path: process.execPath, // Executable path
  args: [], // Optional command-line args
});

// Optional: check if startup is enabled
const loginItemSettings = app.getLoginItemSettings();
console.log("Launch at startup enabled:", loginItemSettings.openAtLogin);

// ------------------- Command Line & Autofill -------------------
app.commandLine.appendSwitch("disable-features", "AutofillServerCommunication");

// ------------------- Quit & Cleanup -------------------
app.on("window-all-closed", () => {
  win = null;
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopQdrant();
  globalShortcut.unregisterAll(); // Clean up global shortcuts
});
