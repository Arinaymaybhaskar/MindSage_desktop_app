// main.js
import { app, BrowserWindow, globalShortcut, ipcMain } from "electron";
import fs from "node:fs";
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
let splash;

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

// ------------------- Optional GPU Fallback -------------------
// Enable this by setting environment variable MS_DISABLE_GPU=1 on affected machines
if (process.platform === "win32" && process.env.MS_DISABLE_GPU === "1") {
  app.commandLine.appendSwitch("disable-gpu");
}

// ------------------- App Ready -------------------
app.whenReady().then(async () => {
  // Simple file logger in userData to debug startup on customer machines
  const logPath = path.join(app.getPath("userData"), "main.log");
  const log = (message) => {
    try {
      fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`);
    } catch {}
  };

  log("App ready");

  // Show splash immediately
  try {
    splash = new BrowserWindow({
      width: 420,
      height: 300,
      resizable: false,
      frame: false,
      alwaysOnTop: true,
      transparent: true,
      show: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });
    const splashUrl = process.env.VITE_DEV_SERVER_URL
      ? `${process.env.VITE_DEV_SERVER_URL}splash.html`
      : `file://${path.join(process.env.DIST, "splash.html")}`;
    splash.loadURL(splashUrl);
    log("Splash window shown");
  } catch (e) {
    log(`Failed to create splash: ${e?.stack || e}`);
  }

  // Create main window in background; it will be shown after services are ready
  try {
    win = await createWindow();
    log("Main window created");
  } catch (e) {
    log(`Failed to create window: ${e?.stack || e}`);
  }

  // Start services asynchronously, and keep the UI up
  (async () => {
    try {
      log("Initializing localDB");
      if (splash && !splash.isDestroyed()) splash.webContents.send('splash-status', 'Initializing local database…');
      localDB.initDatabase();
    } catch (e) {
      log(`localDB init error: ${e?.stack || e}`);
    }

    try {
      log("Running OllamaEmbeddingModelSetup");
      if (splash && !splash.isDestroyed()) splash.webContents.send('splash-status', 'Preparing AI models…');
      OllamaEmbeddingModelSetup();
    } catch (e) {
      log(`Ollama setup error: ${e?.stack || e}`);
    }

    try {
      log("Starting Qdrant");
      if (splash && !splash.isDestroyed()) splash.webContents.send('splash-status', 'Starting vector database…');
      const runtime = await startQdrant();
      log("Qdrant started");
      if (splash && !splash.isDestroyed()) splash.webContents.send('splash-status', 'Wiring up services…');
      registerIPCHandlers(runtime);
      setupEventBusListeners();
      createQdrantWorker();
      log("IPC handlers, event bus, and worker initialized");
      if (win && !win.isDestroyed()) {
        win.webContents.send('services-ready');
        log("Sent services-ready to renderer");
        try {
          if (splash && !splash.isDestroyed()) splash.close();
        } catch {}
        try {
          if (!win.isDestroyed()) win.show();
        } catch {}
      }
    } catch (e) {
      log(`Qdrant/IPC init error: ${e?.stack || e}`);
    }
  })();

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
