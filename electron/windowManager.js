import { BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let win;

export async function createWindow() {
    win = new BrowserWindow({
        width: 1024,
        height: 800,
        minWidth: 1024,
        minHeight: 800,
        show: false,
        icon: path.join(__dirname, "../assets/icon.png"),
        frame: false,
        titleBarStyle: "hidden",
        webPreferences: {
            preload: path.join(__dirname, "preload.mjs"),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    // Splash flow: do not auto-show; main will call win.show() after services are ready

    win.webContents.on("did-finish-load", () => {
        if (!win.isDestroyed()) {
            win.webContents.send("main-process-message", new Date().toLocaleString());
        }
    });

    win.on("maximize", () => {
        if (win && !win.isDestroyed()) win.webContents.send("window-maximized", true);
    });

    win.on("unmaximize", () => {
        if (win && !win.isDestroyed()) win.webContents.send("window-maximized", false);
    });

    if (process.env.VITE_DEV_SERVER_URL) {
        win.loadURL(process.env.VITE_DEV_SERVER_URL);
        win.webContents.openDevTools();
    } else {
        win.loadFile(path.join(process.env.DIST, "index.html"));
    }

    // Window control IPC
    ipcMain.on("minimize-window", () => !win.isDestroyed() && win.minimize());
    ipcMain.on("maximize-window", () => {
        if (!win || win.isDestroyed()) return;
        win.isMaximized() ? win.unmaximize() : win.maximize();
    });
    ipcMain.on("close-window", () => !win.isDestroyed() && win.close());

    ipcMain.handle("open-external", async (_event, url) => {
        try {
            await shell.openExternal(url);
            return { success: true };
        } catch (err) {
            return { success: false, error: String(err) };
        }
    });

    return win;
}
