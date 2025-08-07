import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url' // <-- Import the necessary function
import { startServer } from '../src/server/app'
import http from 'http';
import url from 'url';
import axios from 'axios'
import localDB from './db/index.js';
import bcrypt from 'bcryptjs';
import jwt from "jsonwebtoken";
import { handleGoogleLogin, handleLogin, handleRegister } from './methods/auth.js'
import { userChangePassword, userDeleteAccount, userGetMe, userGetSettings, userUpdateProfile, userUpdateSettings } from './methods/user.js'
import { handleChat, handleCreateJournal, handleDeleteJournal, handleGetAllJournals, handleGetJournalById, handleGetRecentJournals, handleUpdateJournal } from './methods/journal.js'
import { getAudioBase64, getImageBase64, handleOpenMedia, handleSaveMedia } from './methods/media.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(__dirname, '../public')
  : process.env.DIST

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 800,
    height: 600,
    show: false, // Don't show until maximized
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Maximize the window but NOT fullscreen
  win.maximize();

  // Show after maximizing to avoid flicker
  win.show();

  // Send initial message after load
  win.webContents.on("did-finish-load", () => {
    // Check if the window is still alive before sending a message
    if (!win.isDestroyed()) {
      win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(process.env.DIST, 'index.html'));
  }
}



app.whenReady().then(() => {

  localDB.initDatabase();

  ipcMain.handle("media:save", handleSaveMedia);
  ipcMain.handle('media:open', handleOpenMedia);
  ipcMain.handle('media:getImage', async (event, imagePath) => {
    return await getImageBase64(imagePath);
  });
  ipcMain.handle('media:getAudio', async (event, audioPath) => {
    return await getAudioBase64(audioPath);
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
  ipcMain.handle('chat:send', handleChat);

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
  win = null
  if (process.platform !== 'darwin') app.quit()
})