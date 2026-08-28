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
import { registerSetupIPC } from "./services/appSetup.js";
import { applyLaunchAtStartup, registerAppSettingsIPC } from "./appSettings.js";
import { initAutoUpdater } from "./services/autoUpdater.js";
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
    minWidth: 360,
    minHeight: 320,
    frame: false,
    // Windows still draws its own rounded-corner window background behind a
    // frameless BrowserWindow's content. Without this it defaults to opaque
    // white, which showed through as a solid bar above the app's own rounded,
    // themed <div> until the page painted over it - transparent removes that
    // native layer entirely so only the React content is ever visible.
    transparent: true,
    backgroundColor: "#00000000",
    // DWM still draws its own drop shadow and (on Windows 11) rounds the raw
    // window rect for a frameless window, even a transparent one. That native
    // shadow/corner render uses the inactive-window colour, which is a light
    // grey/white - it was showing through the app's own dark rounded corners
    // the moment the window lost focus. Both are cosmetic OS chrome we don't
    // want on top of a fully custom-drawn popup.
    hasShadow: false,
    roundedCorners: false,
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

  // Same path in dev and packaged. main.js and qdrantWorker.js are siblings
  // in dist-electron either way, and when packaged that directory lives
  // inside app.asar, which __dirname already points into. The packaged
  // branch used to resolve process.resourcesPath/dist-electron, which does
  // not exist: dist-electron/**/* is packed into the archive, so the
  // worker never started in a real install.
  const workerPath = path.join(__dirname, "qdrantWorker.js");

  const worker = new Worker(workerPath, { type: "module" });

  worker.on("message", (message) => {
    // Structured progress goes to the renderer's AI activity panel; everything
    // else the worker posts is debug logging.
    if (message?.type === "ai-activity") {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        win.webContents.send("ai-status-event", {
          event: message.event,
          data: message.data,
        });
      }
      return;
    }
    console.log("Qdrant Worker Message:", message);
  });
  worker.on("error", (error) => console.error("Qdrant Worker Error:", error));
  worker.on("exit", (code) => {
    if (code !== 0)
      console.error(`Qdrant Worker stopped with exit code ${code}`);
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

// ------------------- Remote Debugging (capture automation) -------------------
// Opt in with MS_REMOTE_DEBUG=9222 to expose a Chrome DevTools Protocol
// endpoint. This is what lets Playwright attach to the *real* Electron
// renderer for screenshot and demo-video runs. Without it the only reachable
// surface is the bare Vite URL, which loads the UI with no `window.electron`
// bridge - so every IPC call fails and the app renders empty.
//
// Off unless explicitly requested: an open CDP port grants full control of the
// renderer to anything that can reach it, so it must never be on by default.
if (process.env.MS_REMOTE_DEBUG) {
  app.commandLine.appendSwitch(
    "remote-debugging-port",
    process.env.MS_REMOTE_DEBUG,
  );
  // Bind to loopback only so the port is not exposed to the local network.
  app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");
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

  // Sticky so it can be replayed to renderers that load later.
  let servicesReady = false;
  // The backend (DB/Ollama/Qdrant) finishing doesn't mean the renderer has
  // painted anything yet - on a cold start the JS bundle can still be
  // mounting React well after services-ready fires, which showed as a plain
  // white window in the gap between the splash closing and the real UI
  // appearing. The splash now stays up until both sides are ready.
  let rendererVisuallyReady = false;
  let mainWindowRevealed = false;

  const revealMainWindowIfReady = () => {
    if (
      mainWindowRevealed ||
      !servicesReady ||
      !rendererVisuallyReady ||
      !win ||
      win.isDestroyed()
    ) {
      return;
    }
    mainWindowRevealed = true;
    try {
      if (splash && !splash.isDestroyed()) splash.close();
    } catch {}
    try {
      win.show();
    } catch {}
    // Check for app updates once the UI is visible (packaged builds only).
    try {
      initAutoUpdater(win);
    } catch (e) {
      log(`Auto-updater init error: ${e?.stack || e}`);
    }
  };

  // Register setup + app-settings IPC up front so the renderer's first-run
  // onboarding flow can query/drive them before the heavier services finish.
  try {
    registerSetupIPC();
    registerAppSettingsIPC();
    applyLaunchAtStartup();
  } catch (e) {
    log(`Setup/settings IPC init error: ${e?.stack || e}`);
  }

  // Show splash immediately
  try {
    splash = new BrowserWindow({
      width: 420,
      height: 300,
      resizable: false,
      frame: false,
      alwaysOnTop: true,
      transparent: true,
      backgroundColor: "#00000000",
      // Same fix as the Quick Capture window: without these, DWM's own
      // drop shadow and (Windows 11) corner rounding for the raw window
      // rect show through in the inactive-window colour - a light
      // grey/white edge around the transparent card the moment the
      // window isn't focused.
      hasShadow: false,
      roundedCorners: false,
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
    // Replay services-ready for reloads. The event below is sent once, so a
    // renderer that mounts afterwards - or any in-session reload, which is
    // routine while capturing screenshots - would otherwise never see it.
    win.webContents.on("did-finish-load", () => {
      if (servicesReady && !win.isDestroyed()) {
        win.webContents.send("services-ready");
      }
    });
    log("Main window created");
  } catch (e) {
    log(`Failed to create window: ${e?.stack || e}`);
  }

  // The renderer pings this once it has actually painted (see App.tsx),
  // after waiting a couple of animation frames past mount so this isn't just
  // "the blank shell showed up". Registered before services finish so an
  // early ping (fast machine, warm cache) isn't missed.
  ipcMain.on("renderer:visually-ready", () => {
    if (rendererVisuallyReady) return;
    rendererVisuallyReady = true;
    log("Renderer signaled visually ready");
    revealMainWindowIfReady();
  });

  // Safety net: never let a lost/renamed IPC message strand the user on the
  // splash screen forever.
  setTimeout(() => {
    if (!rendererVisuallyReady) {
      log("Renderer visually-ready timed out; revealing anyway");
      rendererVisuallyReady = true;
      revealMainWindowIfReady();
    }
  }, 15000);

  // Start services asynchronously, and keep the UI up
  (async () => {
    try {
      log("Initializing localDB");
      if (splash && !splash.isDestroyed())
        splash.webContents.send(
          "splash-status",
          "Initializing local database…",
        );
      localDB.initDatabase();
    } catch (e) {
      log(`localDB init error: ${e?.stack || e}`);
    }

    try {
      log("Running OllamaEmbeddingModelSetup");
      if (splash && !splash.isDestroyed())
        splash.webContents.send("splash-status", "Preparing AI models…");
      OllamaEmbeddingModelSetup();
    } catch (e) {
      log(`Ollama setup error: ${e?.stack || e}`);
    }

    try {
      log("Starting Qdrant");
      if (splash && !splash.isDestroyed())
        splash.webContents.send("splash-status", "Starting vector database…");
      const runtime = await startQdrant();
      log("Qdrant started");
      if (splash && !splash.isDestroyed())
        splash.webContents.send("splash-status", "Wiring up services…");
      registerIPCHandlers(runtime);
      setupEventBusListeners();
      createQdrantWorker();
      log("IPC handlers, event bus, and worker initialized");
      if (win && !win.isDestroyed()) {
        servicesReady = true;
        win.webContents.send("services-ready");
        log("Sent services-ready to renderer");
        revealMainWindowIfReady();
      }
    } catch (e) {
      log(`Qdrant/IPC init error: ${e?.stack || e}`);
    }
  })();

  // ------------------- Global Shortcut -------------------
  const shortcut =
    process.platform === "darwin"
      ? "Command+Option+Space"
      : "Control+Alt+Space";

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

  if (!registered)
    console.log("Failed to register QuickCapture global shortcut");

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Launch-at-startup is now opt-in and applied from the stored preference in
// `applyLaunchAtStartup()` (see app.whenReady above). The app no longer forces
// itself into Windows startup on every launch.

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
