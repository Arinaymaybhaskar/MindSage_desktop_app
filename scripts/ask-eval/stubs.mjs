// Stands in for "electron" and "electron-store" when the Ask test set runs as
// plain Node: the app's modules import them at the top, but only to keep a
// session and some settings, which live in memory here.
export const app = {
  getPath: () => process.env.MS_USER_DATA_DIR,
  getVersion: () => "0.0.0-ask-eval",
  isPackaged: false,
  on() {},
};
export const BrowserWindow = { getAllWindows: () => [] };
export const ipcMain = { handle() {}, on() {} };
export default class Store {
  constructor({ defaults = {} } = {}) {
    this.data = { ...defaults };
  }
  get(key, fallback) {
    return this.data[key] ?? fallback;
  }
  set(key, value) {
    this.data[key] = value;
  }
  has(key) {
    return key in this.data;
  }
  delete(key) {
    delete this.data[key];
  }
}
