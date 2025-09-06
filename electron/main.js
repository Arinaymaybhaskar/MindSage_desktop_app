import { app, BrowserWindow } from "electron";
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

function createQdrantWorker() {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = dirname(__filename)

  // Use different paths depending on dev or packaged
  const isDev = !app.isPackaged;

  const workerPath = isDev
    ? path.join(__dirname, "qdrantWorker.js") // dev: read directly from electron/ folder
    : path.join(process.resourcesPath, "dist-electron", "qdrantWorker.js"); // packaged exe


  const worker = new Worker(workerPath, {
    type: "module" // <--- important
  });

  // Add this message handler to receive messages from the worker
  worker.on('message', (message) => {
    console.log('Qdrant Worker Message:', message);
  });

  // Add debug logging for worker creation
  console.log('Qdrant worker created successfully');

  // Store worker reference for sending messages
  global.qdrantWorker = worker;

  worker.on('error', (error) => console.error('Qdrant Worker Error:', error))
  worker.on('exit', (code) => {
    if (code !== 0) console.error(`Qdrant Worker stopped with exit code ${code}`)
  })
  worker.on("online", () => {
    console.log("Qdrant worker is online");
  });

  worker.on("exit", (code) => {
    console.log("Qdrant worker exited with code:", code);
  });

  worker.on("error", (err) => {
    console.error("Worker error:", err);
  });

  return worker
}


app.whenReady().then(async () => {
  localDB.initDatabase();
  OllamaEmbeddingModelSetup();
  // Start backend services
  const runtime = await startQdrant();
  registerIPCHandlers(runtime);
  setupEventBusListeners();

  // Start express server
  // startServer();
  createQdrantWorker();

  // Create frontend window
  win = await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.commandLine.appendSwitch("disable-features", "AutofillServerCommunication");

app.on("window-all-closed", () => {
  win = null;
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopQdrant();
});
