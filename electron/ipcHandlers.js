import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path, { dirname, join } from 'node:path';
// Import method handlers
import { handleGoogleLogin, handleLogin, handleRegister } from "./methods/auth.js";
import { userChangePassword, userDeleteAccount, userGetMe, userGetSettings, userUpdateProfile, userUpdateSettings } from "./methods/user.js";
import { handleChat, handleCreateJournal, handleDeleteJournal, handleGetAllJournals, handleGetChartData, handleGetJournalById, handleGetRecentJournals, handleGettingImages, handleUpdateJournal } from "./methods/journal.js";
import { getAudioBase64, getImageBase64, getPdfBase64, handleOpenMedia, handleSaveChatMedia, handleSaveMedia, handleSaveProfileImage } from "./methods/media.js";
import { handleAddCategory, handleDeleteCategory, handleGetCategories, handleUpdateCategory } from "./methods/categories.js";
import { handleCompleteGoal, handleCreateGoal, handleDeleteGoal, handleGetActiveGoals, handleGetCompletedGoals, handleGetGoalById, handleGetPinnedGoals, handleTogglePin, handleUpdateGoal, handleUpdateProgress } from "./methods/goal.js";
import { handleAddProgressLog, handleGetProgressLogs } from "./methods/progressLogs.js";
import { generateSuggestion, handleDownloadOllamaModel, handleGetOllamaModels, handleOllamaPrompt, handleDeleteOllamaModel } from "./methods/ollama.js";
import { startLiveTranscription, stopLiveTranscription, transcribeAudioBlob } from "./methods/whisper.js";
import { getAllTimeScores, getDashboardData, getMonthlyScores } from "./methods/dashboard.js";
import { modelStore} from "./store.js";
import { registerQdrantIPC } from "./methods/qdrant.js";
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from "node:url";
import { handleChangeChatTitle, handleDeleteChat, handleGetChatById, handleGetChats, handleUserMessage, linkMediaToMessage as handleLinkMediaToMessage } from "./methods/chat.js";
import { handleExportUserData } from "./methods/exportData.js";

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

export function createQdrantWorker() {
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = dirname(__filename)

    const worker = new Worker(join(__dirname, 'qdrantWorker.js'))
    worker.on('error', (error) => console.error('Qdrant Worker Error:', error));
    worker.on('exit', (code) => {
        if (code !== 0) console.error(`Qdrant Worker stopped with exit code ${code}`);
    });
    return worker;
}

export function registerIPCHandlers(runtime) {
    // Qdrant
    registerQdrantIPC(runtime);

    // Media
    ipcMain.handle("media:save", handleSaveMedia);
    ipcMain.handle("media:open", handleOpenMedia);
    ipcMain.handle("media:save-profile", handleSaveProfileImage);
    ipcMain.handle("media:getImage", (_e, imagePath) => getImageBase64(imagePath));
    ipcMain.handle("media:getAudio", (_e, audioPath) => getAudioBase64(audioPath));
    ipcMain.handle("media:getPdf", (_e, pdfPath) => getPdfBase64(pdfPath));
    ipcMain.handle("media:linkMessage", handleLinkMediaToMessage);
    ipcMain.handle("media:save-chat-media", handleSaveChatMedia);

    // Auth
    ipcMain.handle("auth:register", handleRegister);
    ipcMain.handle("auth:login", handleLogin);
    ipcMain.handle("login:google", handleGoogleLogin);

    // User
    ipcMain.handle("user:get-me", userGetMe);
    ipcMain.handle("user:update-profile", userUpdateProfile);
    ipcMain.handle("user:get-settings", userGetSettings);
    ipcMain.handle("user:update-settings", userUpdateSettings);
    ipcMain.handle("user:change-password", userChangePassword);
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
    ipcMain.handle("goal:getPinned", handleGetPinnedGoals);
    ipcMain.handle("goal:get-by-id", handleGetGoalById);


    // Logs
    ipcMain.handle("logs:getAll", handleGetProgressLogs);
    ipcMain.handle("logs:add", handleAddProgressLog);

    // Dashboard
    ipcMain.handle("dashboard:get-data", getDashboardData);
    ipcMain.handle("dashboard:get-monthly-scores", getMonthlyScores);
    ipcMain.handle("dashboard:get-all-time-scores", getAllTimeScores);

    // Ollama
    ipcMain.handle("ollama:models", handleGetOllamaModels);
    ipcMain.handle("ollama:get-response", handleOllamaPrompt);
    ipcMain.handle("ollama:generate-suggestion", async (_e, prompt, maxTokens) => {
        try {
            return await generateSuggestion(prompt, maxTokens);
        } catch (err) {
            console.error(err);
            return "";
        }
    });
    ipcMain.handle("ollama:download-model", handleDownloadOllamaModel);
    ipcMain.handle("ollama:delete-model", handleDeleteOllamaModel);


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

    // Settings
    // ipcMain.handle("settings:getSelectedModel", () => getSelectedModel());
    // ipcMain.handle("settings:setSelectedModel", (_e, model) => {
    //     setSelectedModel(model);
    //     return true;
    // });

    // Chat
    ipcMain.handle("chat:get-by-id", handleGetChatById);
    ipcMain.handle("chat:send-message", handleUserMessage);
    ipcMain.handle("chat:get-chats", handleGetChats);
    ipcMain.handle("chat:delete-chat", handleDeleteChat);
    ipcMain.handle("chat:change-title", handleChangeChatTitle);

    // export data
    ipcMain.handle("user:export-data", handleExportUserData);

    ipcMain.handle('dialog:show-save-export', async (event) => {
        const browserWindow = BrowserWindow.fromWebContents(event.sender);
        if (!browserWindow) {
            return { canceled: true, filePath: null };
        }

        const result = await dialog.showSaveDialog(browserWindow, {
            title: 'Save Data Export',
            defaultPath: `my-journal-export-${new Date().toISOString().split('T')[0]}.zip`,
            buttonLabel: 'Save',
            filters: [
                { name: 'ZIP Archives', extensions: ['zip'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        return result; // Will contain { canceled: boolean, filePath: string | undefined }
    });

    // modelStore
    ipcMain.handle('models:get-selected', () => {
        return modelStore.get('selectedModels');
    });

    ipcMain.handle('models:save-selected', (_, models) => {
        modelStore.set('selectedModels', models);
        return true;
    });
}
