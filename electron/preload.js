import { contextBridge, ipcRenderer, webFrame, webUtils } from "electron";

contextBridge.exposeInMainWorld("electron", {
  minimize: () => ipcRenderer.send("minimize-window"),
  maximize: () => ipcRenderer.send("maximize-window"),
  close: () => ipcRenderer.send("close-window"),

  zoom: {
    set: (factor) => webFrame.setZoomFactor(factor),
    get: () => webFrame.getZoomFactor(),
  },

  send: (channel, ...args) => ipcRenderer.send(channel, ...args),
  onStatusUpdate: (callback) => {
    const listener = (_, status) => callback(status);
    ipcRenderer.on("status-update", listener);
    return () => ipcRenderer.removeListener("status-update", listener);
  },
  removeStatusUpdateListener: () => {
    ipcRenderer.removeAllListeners("status-update");
  },

  // Function to subscribe to window state changes
  onWindowStateChange: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("window-maximized", listener);
    return () => {
      ipcRenderer.removeListener("window-maximized", listener);
    };
  },

  ipcRenderer: {
    invoke: (channel, ...args) => {
      const validChannels = [
        "auth:check-username",
        "data:pick-export-path",
        "data:export",
        "data:import-pick",
        "data:import-read",
        "data:import-commit",
        "data:import-undo",
        "data:import-last",
        "auth:get-session",
        "auth:list-profiles",
        "auth:logout",
        "auth:adopt-legacy-session",
        "db:upsertJournalEntry",
        "db:getAllEntries",
        "dialog:saveFile",
        "auth:login",
        "auth:register",
        "user:get-me",
        "user:update-profile",
        "user:get-settings",
        "user:update-settings",
        "user:change-password",
        "user:delete-account",
        "user:delete-summary",
        "journal:create",
        "tags:custom-list",
        "tags:custom-add",
        "journal:get-recent",
        "journal:get-all",
        "journal:get-by-id",
        "journal:update",
        "journal:update-ai-status",
        "journal:delete",
        "journal:get-images",
        "journal:get-chart-data",
        "journal:retry-ai-metadata",
        "journal:accept-feeling",
        "media:get-image",
        "media:get-thumbnail",
        "media:save",
        "media:save-profile",
        "media:get-audio",
        "media:link-message",
        "media:save-chat-media",
        "media:get-pdf",
        "category:get-all",
        "category:delete",
        "category:add",
        "category:update",
        "goal:get-active-goals",
        "goal:get-completed-goals",
        "goal:add",
        "goal:update",
        "goal:delete",
        "goal:toggle-pin",
        "goal:complete",
        "goal:update-progress",
        "goal:get-pinned",
        "goal:get-by-id",
        "logs:get-all",
        "logs:add",
        "ollama:models",
        "ollama:get-response",
        "ollama:generate-suggestion",
        "ollama:download-model",
        "ollama:delete-model",
        "ai:get-status",
        "ai:restart",
        "ai:set-provider",
        "ai:download-model",
        "ai:cancel-download",
        "ai:get-model-picker",
        "ai:probe-speed",
        "ai:select-model",
        "ai:delete-model",
        "ai:get-features",
        "ai:set-feature",
        "ai:get-model-dialog",
        "ai:cuda-offer-get",
        "ai:cuda-offer-answer",
        "ai:setup-get-state",
        "ai:setup-start",
        "ai:setup-pause",
        "ai:setup-answer-metered",
        "ai:setup-online",
        "ai:provider-get",
        "ai:provider-pick-gguf",
        "ai:provider-check",
        "ai:provider-apply",
        "search:query",
        "search:status",
        "dashboard:get-data",
        "dashboard:get-monthly-scores",
        "dashboard:get-all-time-scores",
        "dashboard:get-stats",
        "whisper:transcribe-audio", // one-shot transcription
        "whisper:start-live-transcription", // start live
        "whisper:stop-live-transcription", // stop live
        "settings:getSelectedModel",
        "settings:setSelectedModel",
        "search:sync",
        "chat:get-by-id",
        "chat:get-chats",
        "chat:send-message",
        "chat:delete-chat",
        "chat:change-title",
        "user:export-data",
        "dialog:show-save-export",
        "models:get-selected",
        "models:save-selected",
        "quick-capture:close",
        "eventBus:emit",
        "journal:retry-ai-metadata",
        // First-run setup / AI-stack onboarding
        "setup:get-status",
        "setup:install-ollama",
        "setup:start-ollama",
        "setup:pull-model",
        "setup:delete-model",
        "setup:recommend-model",
        "setup:ensure-embedding",
        // App preferences
        "settings:get-app",
        "settings:set-launch-at-startup",
        "settings:set-check-for-updates",
        "update:check",
        "update:get-state",
        "trash:list",
        "trash:restore",
        "trash:delete-forever",
        "trash:empty",
        "update:install",
        // People
        "people:get-status",
        "people:set-enabled",
        "people:set-paused",
        "people:retry-failed",
        "people:list",
        "people:get",
        "people:summarize",
        "people:get-inbox",
        "people:confirm",
        "people:ignore",
        "people:delete",
        "people:update",
        "people:add-alias",
        "people:remove-alias",
        "people:merge",
        "people:undo-merge",
        "people:entry-mentions",
        "people:fix-mention",
      ];

      if (validChannels.includes(channel)) {
        return ipcRenderer.invoke(channel, ...args);
      }
      console.error(`Invalid IPC channel attempted: ${channel}`);
      return Promise.reject(new Error(`Invalid IPC channel: ${channel}`));
    },

    on: (channel, func) => {
      const validChannels = [
        "main-process-message",
        "sync-complete",
        "sync-error",
        "live-transcription-data", // <-- added live transcription stream events
        "services-ready",
        "ai-status-event",
        "chat:stream", // token-by-token chat generation
        "setup:progress",
        "ai:download-progress",
        "ai:restart-status",
        "ai:setup-state",
        "update:available",
        "update:progress",
        "update:downloaded",
        "update:error",
        "trash:progress",
        "auth:changed",
        "people:changed",
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
    },
  },

  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  // The filesystem path of a dropped File, for importing a dropped journal.
  getPathForFile: (file) => webUtils.getPathForFile(file),

  onAIStarted: (callback) =>
    ipcRenderer.on("journal:aiStarted", (_event, data) => callback(data)),
  onAICompleted: (callback) =>
    ipcRenderer.on("journal:aiCompleted", (_event, data) => callback(data)),
  onChatResponseGenerated: (callback) => {
    ipcRenderer.on("chat:response-generated", (_event, data) => callback(data));
  },

  onChatError: (callback) => {
    ipcRenderer.on("chat:error", (_event, error) => callback(error));
  },

  onAIStatusEvent: (callback) =>
    ipcRenderer.on("ai-status-event", (_event, { event, data }) =>
      callback(event, data),
    ),

  // // --- NEW helpers for Whisper ---
  // whisper: {
  //   transcribeAudio: (audioBlobPath) => ipcRenderer.invoke("whisper:transcribe-audio", audioBlobPath),

  //   startLive: () => ipcRenderer.invoke("whisper:start-live-transcription"),
  //   stopLive: () => ipcRenderer.invoke("whisper:stop-live-transcription"),

  //   onLiveData: (callback) =>
  //     ipcRenderer.on("live-transcription-data", (_event, data) => callback(data)),
  // }
});
