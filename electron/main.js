import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startServer } from '../src/server/app'
import localDB from './db/index.js';
import { handleGoogleLogin, handleLogin, handleRegister } from './methods/auth.js'
import { userChangePassword, userDeleteAccount, userGetMe, userGetSettings, userUpdateProfile, userUpdateSettings } from './methods/user.js'
import { handleChat, handleCreateJournal, handleDeleteJournal, handleGetAllJournals, handleGetChartData, handleGetJournalById, handleGetRecentJournals, handleGettingImages, handleUpdateJournal } from './methods/journal.js'
import { getAudioBase64, getImageBase64, handleOpenMedia, handleSaveMedia, handleSaveProfileImage } from './methods/media.js'
import { handleAddCategory, handleDeleteCategory, handleGetCategories, handleUpdateCategory } from './methods/categories.js'
import { handleCompleteGoal, handleCreateGoal, handleDeleteGoal, handleGetActiveGoals, handleGetCompletedGoals, handleGetPinnedGoals, handleTogglePin, handleUpdateGoal, handleUpdateProgress } from './methods/goal.js'
import { handleAddProgressLog, handleGetProgressLogs } from './methods/progressLogs.js'
import { handleGetOllamaModels, handleOllamaPrompt } from './methods/ollama.js'
// import { createCollection, getQdrantPort, insertVector, searchVector, startQdrant, stopQdrant } from './methods/qdrant.js';

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(__dirname, '../public')
  : process.env.DIST

// This global variable will hold the reference to the main window.
let win;

function createWindow() {
  // ✅ CHANGED: Removed 'const' to assign to the global 'win' variable.
  win = new BrowserWindow({
    width: 1024,
    height: 800,
    minWidth: 1024,
    minHeight: 800,
    show: false, // Don't show until ready
    icon: path.join(__dirname, '../assets/icon.png'),
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Show window when its content is ready (prevents a white flash)
  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) {
      win.show();
    }
  });

  win.webContents.on("did-finish-load", () => {
    if (!win.isDestroyed()) {
      win.webContents.send("main-process-message", new Date().toLocaleString());
    }
  });

  // These listeners are specific to the 'win' instance, so it's okay for them to be here.
  win.on('maximize', () => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('window-maximized', true);
    }
  });
  win.on('unmaximize', () => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('window-maximized', false);
    }
  });


  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(process.env.DIST, 'index.html'));
  }
}

app.whenReady().then(async () => {
  // await startQdrant();
  localDB.initDatabase();

  // --- ✅ MOVED: Window control listeners are now here for consistency ---
  ipcMain.on('minimize-window', () => {
    if (win && !win.isDestroyed()) win.minimize();
  });

  ipcMain.on('maximize-window', () => {
    if (win && !win.isDestroyed()) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  });

  ipcMain.on('close-window', () => {
    if (win && !win.isDestroyed()) win.close();
  });
  // --- End of moved listeners ---

  ipcMain.handle("media:save", handleSaveMedia);
  ipcMain.handle('media:open', handleOpenMedia);
  ipcMain.handle('media:save-profile', handleSaveProfileImage);
  ipcMain.handle('media:getImage', (event, imagePath) => getImageBase64(imagePath));
  ipcMain.handle('media:getAudio', (event, audioPath) => getAudioBase64(audioPath));

  ipcMain.on("screen:maximize", () => {
    if (win && !win.isDestroyed()) {
      win.maximize();
    }
  });

  ipcMain.handle("open-external", async (_event, url) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (err) {
      console.error("openExternal failed:", err);
      return { success: false, error: String(err) };
    }
  });

  // auth
  ipcMain.handle('auth:register', handleRegister);
  ipcMain.handle('auth:login', handleLogin);
  ipcMain.handle('login:google', handleGoogleLogin);

  // user
  ipcMain.handle("user:get-me", userGetMe);
  ipcMain.handle('user:update-profile', userUpdateProfile);
  ipcMain.handle('user:get-settings', userGetSettings);
  ipcMain.handle('user:update-settings', userUpdateSettings);
  ipcMain.handle("user:change-password", userChangePassword);
  ipcMain.handle('user:delete-account', userDeleteAccount);

  // journal
  ipcMain.handle('journal:create', handleCreateJournal);
  ipcMain.handle('journal:get-recent', handleGetRecentJournals);
  ipcMain.handle('journal:get-all', handleGetAllJournals);
  ipcMain.handle('journal:get-by-id', handleGetJournalById);
  ipcMain.handle('journal:update', handleUpdateJournal);
  ipcMain.handle('journal:delete', handleDeleteJournal);
  ipcMain.handle('journal:get-images', handleGettingImages);
  ipcMain.handle('journal:get-chart-data', handleGetChartData);
  ipcMain.handle('chat:send', handleChat);

  // Categories
  ipcMain.handle('category:get-all', handleGetCategories);
  ipcMain.handle('category:delete', handleDeleteCategory);
  ipcMain.handle('category:add', handleAddCategory);
  ipcMain.handle("category:update", handleUpdateCategory);

  // goals
  ipcMain.handle('goal:get-active-goals', handleGetActiveGoals);
  ipcMain.handle("goal:get-completed-goals", handleGetCompletedGoals);
  ipcMain.handle('goal:add', handleCreateGoal);
  ipcMain.handle('goal:update', handleUpdateGoal);
  ipcMain.handle('goal:delete', handleDeleteGoal);
  ipcMain.handle('goal:toggle-pin', handleTogglePin);
  ipcMain.handle('goal:complete', handleCompleteGoal);
  ipcMain.handle('goal:update-progress', handleUpdateProgress);
  ipcMain.handle('goal:getPinned', handleGetPinnedGoals);

  // logs
  ipcMain.handle('logs:getAll', handleGetProgressLogs);
  ipcMain.handle('logs:add', handleAddProgressLog);

  // ollama
  ipcMain.handle('ollama:models', handleGetOllamaModels);
  ipcMain.handle('ollama:get-response', handleOllamaPrompt);

  // Start your backend server first!
  startServer();

  // Then create the frontend window
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication');

app.on('window-all-closed', () => {
  win = null;
  if (process.platform !== 'darwin') app.quit();
});