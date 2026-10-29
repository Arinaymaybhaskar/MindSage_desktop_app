import { BrowserWindow, dialog, ipcMain } from "electron";
import {
  handleCommitImport,
  handleExportJournal,
  handlePickExportPath,
  handlePickImport,
  handleReadImport,
  handleUndoImport,
} from "./methods/portability.js";
import {
  handleCheckUsername,
  handleLogin,
  handleRegister,
} from "./methods/auth.js";
import {
  userChangePassword,
  userDeleteAccount,
  userDeleteSummary,
  userGetMe,
  userGetSettings,
  userUpdateProfile,
  userUpdateSettings,
} from "./methods/user.js";
import {
  handleChat,
  handleCreateJournal,
  handleDeleteJournal,
  handleGetAllJournals,
  handleGetChartData,
  handleGetJournalById,
  handleGetRecentJournals,
  handleGettingImages,
  handleUpdateJournal,
  handleRetryAIMetadata,
  handleUpdateAIStatus,
} from "./methods/journal.js";
import {
  getAudioBase64,
  getImageBase64,
  getThumbnailBase64,
  getPdfBase64,
  handleOpenMedia,
  handleSaveChatMedia,
  handleSaveMedia,
  handleSaveProfileImage,
} from "./methods/media.js";
import {
  handleAddCategory,
  handleDeleteCategory,
  handleGetCategories,
  handleUpdateCategory,
} from "./methods/categories.js";
import {
  handleCompleteGoal,
  handleCreateGoal,
  handleDeleteGoal,
  handleGetActiveGoals,
  handleGetCompletedGoals,
  handleGetGoalById,
  handleGetPinnedGoals,
  handleTogglePin,
  handleUpdateGoal,
  handleUpdateProgress,
} from "./methods/goal.js";
import {
  handleAddProgressLog,
  handleGetProgressLogs,
} from "./methods/progressLogs.js";
import {
  generateSuggestion,
  handleDownloadOllamaModel,
  handleGetOllamaModels,
  handleOllamaPrompt,
  handleDeleteOllamaModel,
} from "./methods/ollama.js";
import {
  handleCancelAIDownload,
  handleGetModelPicker,
  handleProbeAISpeed,
  handleSelectAIModel,
  handleDeleteAIModel,
  handleGetModelDialog,
  handleDownloadAIModel,
  handleGetAIStatus,
  handleRestartAI,
  handleSetAIProvider,
  handleGetAIFeatures,
  handleSetAIFeature,
  handleGetCudaOffer,
  handleAnswerCudaOffer,
} from "./methods/ai.js";
import {
  handleAnswerMetered,
  handleGetSetupState,
  handlePauseSetup,
  handleSetupOnline,
  handleStartSetup,
} from "./methods/aiSetup.js";
import {
  handleApplyProvider,
  handleCheckProvider,
  handleGetProviderConfig,
  handlePickGguf,
} from "./methods/aiProvider.js";
import {
  startLiveTranscription,
  stopLiveTranscription,
  transcribeAudioBlob,
} from "./methods/whisper.js";
import {
  getAllTimeScores,
  getDashboardData,
  getMonthlyScores,
  getUserStats,
} from "./methods/dashboard.js";
import { modelStore } from "./store.js";
import { registerSearchIPC } from "./methods/search.js";
import {
  handleChangeChatTitle,
  handleDeleteChat,
  handleGetChatById,
  handleGetChats,
  handleUserMessage,
  linkMediaToMessage as handleLinkMediaToMessage,
} from "./methods/chat.js";
import { handleExportUserData } from "./methods/exportData.js";
import {
  handleAddAlias,
  handleConfirmPerson,
  handleDeletePerson,
  handleFixMention,
  handleGetEntryMentions,
  handleGetInbox,
  handleGetPerson,
  handleGetStatus as handleGetPeopleStatus,
  handleIgnorePerson,
  handleListPeople,
  handleMergePeople,
  handleRemoveAlias,
  handleRetryFailed,
  handleSetEnabled as handleSetPeopleEnabled,
  handleSetPaused as handleSetPeoplePaused,
  handleSummarize,
  handleUndoMerge,
  handleUpdatePerson,
} from "./methods/people.js";
import { eventBus } from "./eventBus.js";
import { db } from "./db/connection.js";
import { log } from "./log.js";

// Nothing registered here may wait on the vector index: see
// services/startServices.js for why.
export function registerIPCHandlers() {
  // Search
  registerSearchIPC();

  // Media
  ipcMain.handle("media:save", handleSaveMedia);
  ipcMain.handle("media:open", handleOpenMedia);
  ipcMain.handle("media:save-profile", handleSaveProfileImage);
  ipcMain.handle("media:get-image", (_e, imagePath) =>
    getImageBase64(imagePath),
  );
  ipcMain.handle("media:get-thumbnail", (_e, imagePath, maxWidth) =>
    getThumbnailBase64(imagePath, maxWidth),
  );
  ipcMain.handle("media:get-audio", (_e, audioPath) =>
    getAudioBase64(audioPath),
  );
  ipcMain.handle("media:get-pdf", (_e, pdfPath) => getPdfBase64(pdfPath));
  ipcMain.handle("media:link-message", handleLinkMediaToMessage);
  ipcMain.handle("media:save-chat-media", handleSaveChatMedia);

  // Auth
  ipcMain.handle("auth:register", handleRegister);
  ipcMain.handle("auth:login", handleLogin);
  ipcMain.handle("auth:check-username", handleCheckUsername);

  // User
  ipcMain.handle("user:get-me", userGetMe);
  ipcMain.handle("user:update-profile", userUpdateProfile);
  ipcMain.handle("user:get-settings", userGetSettings);
  ipcMain.handle("user:update-settings", userUpdateSettings);
  ipcMain.handle("user:change-password", userChangePassword);
  ipcMain.handle("user:delete-summary", userDeleteSummary);
  ipcMain.handle("user:delete-account", userDeleteAccount);

  // Journal
  ipcMain.handle("journal:create", handleCreateJournal);
  ipcMain.handle("journal:get-recent", handleGetRecentJournals);
  ipcMain.handle("journal:get-all", handleGetAllJournals);
  ipcMain.handle("journal:get-by-id", handleGetJournalById);
  ipcMain.handle("journal:update", handleUpdateJournal);
  ipcMain.handle("journal:delete", handleDeleteJournal);
  ipcMain.handle("journal:get-images", handleGettingImages);
  ipcMain.handle("journal:get-chart-data", handleGetChartData);
  ipcMain.handle("journal:retry-ai-metadata", handleRetryAIMetadata);
  ipcMain.handle("journal:update-ai-status", handleUpdateAIStatus);
  ipcMain.handle("chat:send", handleChat);

  // Categories
  ipcMain.handle("category:get-all", handleGetCategories);
  ipcMain.handle("category:delete", handleDeleteCategory);
  ipcMain.handle("category:add", handleAddCategory);
  ipcMain.handle("category:update", handleUpdateCategory);

  // Goals
  ipcMain.handle("goal:get-active-goals", handleGetActiveGoals);
  ipcMain.handle("goal:get-completed-goals", handleGetCompletedGoals);
  ipcMain.handle("goal:add", handleCreateGoal);
  ipcMain.handle("goal:update", handleUpdateGoal);
  ipcMain.handle("goal:delete", handleDeleteGoal);
  ipcMain.handle("goal:toggle-pin", handleTogglePin);
  ipcMain.handle("goal:complete", handleCompleteGoal);
  ipcMain.handle("goal:update-progress", handleUpdateProgress);
  ipcMain.handle("goal:get-pinned", handleGetPinnedGoals);
  ipcMain.handle("goal:get-by-id", handleGetGoalById);

  // Logs
  ipcMain.handle("logs:get-all", handleGetProgressLogs);
  ipcMain.handle("logs:add", handleAddProgressLog);

  // Dashboard
  ipcMain.handle("dashboard:get-data", getDashboardData);
  ipcMain.handle("dashboard:get-monthly-scores", getMonthlyScores);
  ipcMain.handle("dashboard:get-all-time-scores", getAllTimeScores);
  ipcMain.handle("dashboard:get-stats", getUserStats);

  // Ollama
  ipcMain.handle("ollama:models", handleGetOllamaModels);
  ipcMain.handle("ollama:get-response", handleOllamaPrompt);
  ipcMain.handle(
    "ollama:generate-suggestion",
    async (_e, prompt, maxTokens) => {
      try {
        return await generateSuggestion(prompt, maxTokens);
      } catch (err) {
        log.error(err);
        return "";
      }
    },
  );
  ipcMain.handle("ollama:download-model", handleDownloadOllamaModel);
  ipcMain.handle("ollama:delete-model", handleDeleteOllamaModel);

  // AI client: provider choice and the built-in engine's models
  ipcMain.handle("ai:get-status", handleGetAIStatus);
  ipcMain.handle("ai:restart", handleRestartAI);
  ipcMain.handle("ai:set-provider", handleSetAIProvider);
  ipcMain.handle("ai:download-model", handleDownloadAIModel);
  ipcMain.handle("ai:cancel-download", handleCancelAIDownload);
  ipcMain.handle("ai:get-model-picker", handleGetModelPicker);
  ipcMain.handle("ai:probe-speed", handleProbeAISpeed);
  ipcMain.handle("ai:select-model", handleSelectAIModel);
  ipcMain.handle("ai:delete-model", handleDeleteAIModel);
  ipcMain.handle("ai:get-features", handleGetAIFeatures);
  ipcMain.handle("ai:set-feature", handleSetAIFeature);
  ipcMain.handle("ai:get-model-dialog", handleGetModelDialog);
  ipcMain.handle("ai:cuda-offer-get", handleGetCudaOffer);
  ipcMain.handle("ai:cuda-offer-answer", handleAnswerCudaOffer);
  ipcMain.handle("ai:setup-get-state", handleGetSetupState);
  ipcMain.handle("ai:setup-start", handleStartSetup);
  ipcMain.handle("ai:setup-pause", handlePauseSetup);
  ipcMain.handle("ai:setup-answer-metered", handleAnswerMetered);
  ipcMain.handle("ai:setup-online", handleSetupOnline);
  ipcMain.handle("ai:provider-get", handleGetProviderConfig);
  ipcMain.handle("ai:provider-pick-gguf", handlePickGguf);
  ipcMain.handle("ai:provider-check", handleCheckProvider);
  ipcMain.handle("ai:provider-apply", handleApplyProvider);

  // Whisper
  ipcMain.handle("whisper:start-live-transcription", startLiveTranscription);
  ipcMain.handle("whisper:stop-live-transcription", stopLiveTranscription);
  ipcMain.handle("whisper:transcribe-audio", async (event, filePath) => {
    try {
      const result = await transcribeAudioBlob(filePath, event);
      event.sender.send("blob-transcription-result", result);
    } catch (err) {
      event.sender.send("blob-transcription-error", err.message);
    }
  });

  ipcMain.handle(
    "whisper:transcribe-journal-audio",
    async (event, audioFilePath, journalId) => {
      try {
        const result = await transcribeAudioBlob(audioFilePath, event);
        if (
          result &&
          result.transcription &&
          Array.isArray(result.transcription)
        ) {
          const transcriptionText = result.transcription
            .map((seg) => seg.text)
            .join(" ")
            .replace(/\[.*?\]/g, "")
            .trim();
          return transcriptionText;
        }
        return null;
      } catch (err) {
        log.error("Transcription error:", err);
        return null;
      }
    },
  );

  // Chat
  ipcMain.handle("chat:get-by-id", handleGetChatById);
  ipcMain.handle("chat:send-message", handleUserMessage);
  ipcMain.handle("chat:get-chats", handleGetChats);
  ipcMain.handle("chat:delete-chat", handleDeleteChat);
  ipcMain.handle("chat:change-title", handleChangeChatTitle);

  // People
  ipcMain.handle("people:get-status", handleGetPeopleStatus);
  ipcMain.handle("people:set-enabled", handleSetPeopleEnabled);
  ipcMain.handle("people:set-paused", handleSetPeoplePaused);
  ipcMain.handle("people:retry-failed", handleRetryFailed);
  ipcMain.handle("people:list", handleListPeople);
  ipcMain.handle("people:get", handleGetPerson);
  ipcMain.handle("people:summarize", handleSummarize);
  ipcMain.handle("people:get-inbox", handleGetInbox);
  ipcMain.handle("people:confirm", handleConfirmPerson);
  ipcMain.handle("people:ignore", handleIgnorePerson);
  ipcMain.handle("people:delete", handleDeletePerson);
  ipcMain.handle("people:update", handleUpdatePerson);
  ipcMain.handle("people:add-alias", handleAddAlias);
  ipcMain.handle("people:remove-alias", handleRemoveAlias);
  ipcMain.handle("people:merge", handleMergePeople);
  ipcMain.handle("people:undo-merge", handleUndoMerge);
  ipcMain.handle("people:entry-mentions", handleGetEntryMentions);
  ipcMain.handle("people:fix-mention", handleFixMention);

  // export data
  ipcMain.handle("user:export-data", handleExportUserData);

  // Export in other apps' formats, and import what other apps export.
  ipcMain.handle("data:pick-export-path", handlePickExportPath);
  ipcMain.handle("data:export", handleExportJournal);
  ipcMain.handle("data:import-pick", handlePickImport);
  ipcMain.handle("data:import-read", handleReadImport);
  ipcMain.handle("data:import-commit", handleCommitImport);
  ipcMain.handle("data:import-undo", handleUndoImport);

  ipcMain.handle("dialog:show-save-export", async (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    if (!browserWindow) {
      return { canceled: true, filePath: null };
    }

    const result = await dialog.showSaveDialog(browserWindow, {
      title: "Save Data Export",
      defaultPath: `my-journal-export-${new Date().toISOString().split("T")[0]}.zip`,
      buttonLabel: "Save",
      filters: [
        { name: "ZIP Archives", extensions: ["zip"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });

    return result;
  });

  // modelStore
  ipcMain.handle("models:get-selected", () => {
    return modelStore.get("selectedModels");
  });

  ipcMain.handle("models:save-selected", (_, models) => {
    modelStore.set("selectedModels", models);
    return true;
  });

  // eventBus
  ipcMain.handle("eventBus:emit", (ipcEvent, { event, args }) => {
    eventBus.emit(event, ...args);
    return true;
  });

  // Forward AI status events to renderer
  const aiEvents = [
    "journal:aiStarted",
    "journal:aiCompleted",
    "journal:aiFailed",
    "ollama:summary-started",
    "ollama:summary-generated",
    "ollama:summary-failed",
    "ollama:summary-skipped",
  ];
  /**
   * The AI events carry only an entry id, but the activity panel has to name
   * the entry being worked on. A new entry has no title yet (generating one is
   * the job being reported), so a content snippet is sent alongside it.
   */
  const describeEntry = (entryId) => {
    if (typeof entryId !== "number") return {};
    try {
      const row = db
        .prepare(`SELECT title, content FROM journal_entries WHERE id = ?`)
        .get(entryId);
      if (!row) return {};
      return {
        title: row.title ?? "",
        preview: (row.content ?? "").replace(/\s+/g, " ").trim().slice(0, 90),
      };
    } catch {
      // Naming the entry is cosmetic; never let it break the event.
      return {};
    }
  };

  aiEvents.forEach((eventName) => {
    eventBus.on(eventName, (data) => {
      // Resolve the live window the same way events.js does.
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        win.webContents.send("ai-status-event", {
          event: eventName,
          data: { ...describeEntry(data?.entryId), ...data },
        });
      }
    });
  });
}
