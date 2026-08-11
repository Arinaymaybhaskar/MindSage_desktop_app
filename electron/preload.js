import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  minimize: () => ipcRenderer.send('minimize-window'),
  maximize: () => ipcRenderer.send('maximize-window'),
  close: () => ipcRenderer.send('close-window'),

  zoom: {
    set: (factor) => {
      const { webFrame } = require("electron");
      webFrame.setZoomFactor(factor);
    },
    get: () => {
      const { webFrame } = require("electron");
      return webFrame.getZoomFactor();
    },
  },

  send: (channel, ...args) => ipcRenderer.send(channel, ...args),
  onStatusUpdate: (callback) => {
    ipcRenderer.on("status-update", (_, status) => callback(status));
  },
  removeStatusUpdateListener: () => {
    ipcRenderer.removeAllListeners("status-update");
  },

  // Function to subscribe to window state changes
  onWindowStateChange: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('window-maximized', listener);
    return () => {
      ipcRenderer.removeListener('window-maximized', listener);
    };
  },

  ipcRenderer: {
    invoke: (channel, ...args) => {
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
        'journal:update-ai-status',
        'journal:delete',
        'journal:get-mood-scores',
        'journal:get-images',
        "journal:get-chart-data",
        "journal:retry-ai-metadata",
        'media:getImage',
        'media:save',
        'media:save-profile',
        "media:getAudio",
        "media:linkMessage",
        "media:save-chat-media",
        "media:getPdf",
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
        "goal:get-by-id",
        'logs:getAll',
        'logs:add',
        'ollama:models',
        "ollama:get-response",
        "ollama:generate-suggestion",
        "ollama:download-model",
        "ollama:delete-model",
        "qdrant:get-collections",
        "qdrant:create-collection",
        "qdrant:upsert",
        "qdrant:search",
        "qdrant:delete-collection",
        "dashboard:get-data",
        "dashboard:get-monthly-scores",
        "dashboard:get-all-time-scores",
        "dashboard:get-stats",
        "whisper:transcribe-audio",      // one-shot transcription
        "whisper:start-live-transcription", // start live
        "whisper:stop-live-transcription",  // stop live
        "settings:getSelectedModel",
        "settings:setSelectedModel",
        "qdrant:bulk-sync", // Add this new channel
        "qdrant:sync-journal",
        "qdrant:sync-goal",
        "qdrant:sync-progress-log",
        "chat:get-by-id",
        "chat:get-chats",
        "chat:send-message",
        "chat:delete-chat",
        "chat:change-title",
        "user:export-data",
        "dialog:show-save-export",
        'models:get-selected',
        'models:save-selected',
        "quick-capture:close",
        "eventBus:emit",
        "journal:retry-ai-metadata"
      ];

      if (validChannels.includes(channel)) {
        return ipcRenderer.invoke(channel, ...args);
      }
      console.error(`Invalid IPC channel attempted: ${channel}`);
      return Promise.reject(new Error(`Invalid IPC channel: ${channel}`));
    },

    on: (channel, func) => {
      const validChannels = [
        'main-process-message',
        'sync-complete',
        'sync-error',
        "live-transcription-data", // <-- added live transcription stream events
        'services-ready',
        'ai-status-event'
      ];
      if (!validChannels.includes(channel)) {
        return () => {};
      }
      // Wrap so the renderer callback doesn't receive the IpcRendererEvent.
      // Return an unsubscribe that removes ONLY this listener, so one component
      // unmounting doesn't clobber every other subscriber on the channel.
      const listener = (event, ...args) => func(...args);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },

    removeAllListeners: (channel) => {
      ipcRenderer.removeAllListeners(channel);
    }
  },

  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  onAIStarted: (callback) => ipcRenderer.on("journal:aiStarted", (_event, data) => callback(data)),
  onAICompleted: (callback) => ipcRenderer.on("journal:aiCompleted", (_event, data) => callback(data)),
  onChatResponseGenerated: (callback) => {
    ipcRenderer.on("chat:response-generated", (_event, data) => callback(data));
  },

  onChatError: (callback) => {
    ipcRenderer.on("chat:error", (_event, error) => callback(error));
  },

  onAIStatusEvent: (callback) => ipcRenderer.on("ai-status-event", (_event, { event, data }) => callback(event, data)),

  // // --- NEW helpers for Whisper ---
  // whisper: {
  //   transcribeAudio: (audioBlobPath) => ipcRenderer.invoke("whisper:transcribe-audio", audioBlobPath),

  //   startLive: () => ipcRenderer.invoke("whisper:start-live-transcription"),
  //   stopLive: () => ipcRenderer.invoke("whisper:stop-live-transcription"),

  //   onLiveData: (callback) =>
  //     ipcRenderer.on("live-transcription-data", (_event, data) => callback(data)),
  // }
});
