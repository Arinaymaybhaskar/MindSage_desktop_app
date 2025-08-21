import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  minimize: () => ipcRenderer.send('minimize-window'),
  maximize: () => ipcRenderer.send('maximize-window'),
  close: () => ipcRenderer.send('close-window'),
  // Function to subscribe to window state changes
  onWindowStateChange: (callback) => {
    // Create a listener function that wraps the callback
    const listener = (_event, value) => callback(value);

    // Add the listener for the 'window-maximized' channel
    ipcRenderer.on('window-maximized', listener);

    // Return a cleanup function that removes the *specific* listener
    return () => {
      ipcRenderer.removeListener('window-maximized', listener);
    };
  },
  ipcRenderer: {
    // Expose a safe subset of ipcRenderer methods
    invoke: (channel, ...args) => {
      // --- UPDATED: Added auth channels to the whitelist ---
      const validChannels = [
        'login:google',
        'db:upsertJournalEntry',
        'db:getAllEntries',
        'dialog:saveFile',
        'auth:login',
        'auth:register',
        "user:get-me",
        'user:update-profile',
        'user:get-settings',
        'user:update-settings',
        "user:change-password",
        'user:delete-account',
        'journal:create',
        'journal:get-recent',
        'journal:get-all',
        'journal:get-by-id',
        'journal:update',
        'journal:delete',
        'journal:get-mood-scores',
        'journal:get-images',
        "journal:get-chart-data",
        'media:getImage',
        'media:save',
        'media:save-profile', // <-- NEW allowed channel
        "media:getAudio",
        'media:save',
        'category:get-all',
        'category:delete',
        'category:add',
        "category:update",
        'goal:get-active-goals',
        "goal:get-completed-goals",
        'goal:add',
        'goal:update',
        'goal:delete',
        'goal:toggle-pin',
        'goal:complete',
        'goal:update-progress',
        'goal:getPinned',
        'logs:getAll',
        'logs:add',
        'ollama:models',
        "ollama:get-response",
        "qdrant:start",
        "qdrant:createCollection",
        "qdrant:insertVector",
        "qdrant:searchVector",
        "qdrant:stop",
      ];

      if (validChannels.includes(channel)) {
        return ipcRenderer.invoke(channel, ...args);
      }
      // It's good practice to throw an error for invalid channels
      console.error(`Invalid IPC channel attempted: ${channel}`);
      return Promise.reject(new Error(`Invalid IPC channel: ${channel}`));
    },
    on: (channel, func) => {
      const validChannels = ['main-process-message', 'sync-complete', 'sync-error'];
      if (validChannels.includes(channel)) {
        // Deliberately strip event as it includes `sender`
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      }
    },
    removeAllListeners: (channel) => {
      ipcRenderer.removeAllListeners(channel);
    }
  },
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
});
