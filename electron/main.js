// main.js
// Must stay first: it redirects userData before any module reads it.
import "./userDataOverride.js";
import { app, BrowserWindow, globalShortcut, ipcMain, shell } from "electron";
import fs from "node:fs";
import path, { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import localDB from "./db/index.js";
// import { startServer } from "../src/server/app.js";
import { createWindow } from "./windowManager.js";
import { guardContents, isAppUrl } from "./windowGuard.js";
import { registerIPCHandlers } from "./ipcHandlers.js";
import { setupEventBusListeners } from "./events.js";
import { startQdrant, stopQdrant } from "./services/qdrantManager.js";
import { startServices } from "./services/startServices.js";
import { markIndexSettled } from "./services/searchIndex.js";
import { createServiceAnnouncer } from "./services/serviceAnnouncer.js";
import { setQdrantRuntime } from "./methods/qdrant.js";
import { OllamaEmbeddingModelSetup } from "./services/OllamaSetup.js";
import { registerSetupIPC } from "./services/appSetup.js";
import { applyLaunchAtStartup, registerAppSettingsIPC } from "./appSettings.js";
import { registerSessionIPC } from "./methods/auth.js";
import { initAutoUpdater, registerUpdaterIPC } from "./services/autoUpdater.js";
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
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
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

// ------------------- Navigation guard -------------------
// Every window, including the ones created later, may only show the app's own
// pages. A link that asks for a new window is refused, and goes to the
// default browser instead when it is a web or mail address.
app.on("web-contents-created", (_event, contents) => {
  guardContents(contents, {
    isApp: (url) =>
      isAppUrl(url, {
        devUrl: process.env.VITE_DEV_SERVER_URL,
        distDir: process.env.DIST,
      }),
    openExternal: (url) => shell.openExternal(url).catch(() => {}),
  });
});

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
    // Check for app updates once the UI is visible: packaged builds only,
    // and only if the user turned automatic checks on in Settings.
    initAutoUpdater(win).catch((e) =>
      log(`Auto-updater init error: ${e?.stack || e}`),
    );
  };

  // Register setup + app-settings IPC up front so the renderer's first-run
  // onboarding flow can query/drive them before the heavier services finish.
  try {
    registerSetupIPC();
    registerAppSettingsIPC();
    registerUpdaterIPC(() => win);
    registerSessionIPC();
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
        preload: path.join(__dirname, "splashPreload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
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

  const splashStatus = (text) => {
    if (splash && !splash.isDestroyed())
      splash.webContents.send("splash-status", text);
  };

  // ---- Everything the window can ask for exists before the window does ----
  //
  // The database is initialised and every IPC handler is registered here,
  // before the main window is created, so a renderer can never invoke a
  // channel that has no handler yet. That used to be left to timing: handlers
  // came after `await startQdrant()`, and a signed-in user's first screen
  // asked for `models:get-selected` long before then ("No handler
  // registered"). Do not put an await between these steps and createWindow.
  try {
    log("Initializing localDB");
    splashStatus("Initializing local database…");
    localDB.initDatabase();
  } catch (e) {
    log(`localDB init error: ${e?.stack || e}`);
  }

  try {
    log("Running OllamaEmbeddingModelSetup");
    splashStatus("Preparing AI models…");
    OllamaEmbeddingModelSetup();
  } catch (e) {
    log(`Ollama setup error: ${e?.stack || e}`);
  }

  // The renderer pings this once it has actually painted (see App.tsx),
  // after waiting a couple of animation frames past mount so this isn't just
  // "the blank shell showed up". Registered before the window exists so an
  // early ping (fast machine, warm cache) isn't missed.
  ipcMain.on("renderer:visually-ready", () => {
    if (rendererVisuallyReady) return;
    rendererVisuallyReady = true;
    log("Renderer signaled visually ready");
    revealMainWindowIfReady();
  });

  // Tells the window how services ended up, once there is a window, whether
  // the vector index settles first or the window is created first.
  const announcer = createServiceAnnouncer({
    getWindow: () => win,
    onSent: (status) => {
      servicesReady = true;
      log(
        status.degraded
          ? "Sent services-ready to renderer (degraded: search unavailable)"
          : "Sent services-ready to renderer",
      );
      revealMainWindowIfReady();
    },
  });

  // Registers the handlers and event bus synchronously, then starts the
  // vector index in the background. See services/startServices.js.
  startServices({
    registerHandlers: () => {
      splashStatus("Wiring up services…");
      registerIPCHandlers();
      setupEventBusListeners();
      log("IPC handlers and event bus registered");
    },
    startIndex: async () => {
      log("Starting Qdrant");
      splashStatus("Starting vector database…");
      const runtime = await startQdrant();
      log("Qdrant started");
      return runtime;
    },
    onIndexReady: (runtime) => {
      setQdrantRuntime(runtime);
      // startQdrant has set QDRANT_HTTP_PORT by now, which the worker
      // reads; it is never started without one.
      if (!global.qdrantWorker) createQdrantWorker();
      log("Search index and worker initialized");
    },
    onStatus: (status) => {
      markIndexSettled();
      announcer.update(status);
    },
    log,
  }).catch((e) => log(`Service startup error: ${e?.stack || e}`));

  // Create the main window hidden; it is revealed once services have
  // reported (ready or degraded) and the renderer has painted.
  try {
    win = await createWindow();
    // Replay services-ready for reloads. It is sent once per status, so a
    // renderer that mounts afterwards - or any in-session reload, which is
    // routine while capturing screenshots - would otherwise never see it.
    win.webContents.on("did-finish-load", () => {
      announcer.replay(win);
    });
    log("Main window created");
    // The index may have settled before the window existed.
    announcer.flush();
  } catch (e) {
    log(`Failed to create window: ${e?.stack || e}`);
  }

  // Safety net: never let a lost/renamed IPC message strand the user on the
  // splash screen forever.
  setTimeout(() => {
    if (!rendererVisuallyReady) {
      log("Renderer visually-ready timed out; revealing anyway");
      rendererVisuallyReady = true;
      revealMainWindowIfReady();
    }
  }, 15000);

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
