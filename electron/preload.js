import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    // Expose a safe subset of ipcRenderer methods
    invoke: (channel, ...args) => {
      // --- UPDATED: Added auth channels to the whitelist ---
      const validChannels = [
        'login:google', 
        'db:upsertJournalEntry', 
        'db:getAllEntries', 
        'dialog:saveFile',
        'auth:login',       // <-- Added for standard login
        'auth:register',     // <-- Added for standard registration
        "user:get-me",
        'user:update-profile',
        'user:get-settings',
        'user:update-settings',
        "user:change-password",
        'user:delete-account',
        'journal:create',
        'journal:get-recent',
        'journal:get-all', // <-- FIX: This channel was missing
        'journal:get-by-id',
        'journal:update',
        'journal:delete',
        'journal:get-mood-scores',
        'media:getImage',
        'media:save',
        "media:getAudio"
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
});
