import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url' // <-- Import the necessary function

// --- FIX FOR ES MODULE SCOPE ---
// This is the modern equivalent of __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
// -----------------------------

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.js
// │
process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(__dirname, '../public')
  : process.env.DIST

let win: BrowserWindow | null

function createWindow() {
  win = new BrowserWindow({
    width: 800,
    height: 600,
    show: false, // Don't show until maximized
    icon: path.join(process.env.VITE_PUBLIC, 'logo.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Maximize the window but NOT fullscreen
  win.maximize();

  // Show after maximizing to avoid flicker
  win.show();

  // Send initial message after load
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString());
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(process.env.DIST, 'index.html'));
  }
}


// --- File Handling Logic ---
async function handleFileSave() {
  if (!win) return { success: false, message: 'Main window not available.' };

  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif'] }]
  });
  if (canceled || filePaths.length === 0) return { success: false, message: 'No file selected.' };
  
  const sourcePath = filePaths[0];
  const originalFileName = path.basename(sourcePath);

  const { canceled: saveCanceled, filePath: destPath } = await dialog.showSaveDialog(win, {
    title: 'Save Image As',
    defaultPath: path.join(app.getPath('documents'), `copy-of-${originalFileName}`),
  });

  if (saveCanceled || !destPath) return { success: false, message: 'Save operation canceled.' };

  try {
    fs.copyFileSync(sourcePath, destPath);
    return { success: true, message: `File saved successfully to ${destPath}` };
  } catch (error: any) {
    console.error('File saving error:', error);
    return { success: false, message: `Error saving file: ${error.message}` };
  }
}


app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.whenReady().then(() => {
  ipcMain.handle('dialog:saveFile', handleFileSave);
  createWindow();
})