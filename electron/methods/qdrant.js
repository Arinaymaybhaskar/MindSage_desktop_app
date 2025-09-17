import { ipcMain } from "electron";
import { QdrantClient } from "@qdrant/js-client-rest";
import { eventBus } from "../eventBus.js";

let client = null;

export function registerQdrantIPC(runtime) {
    client = new QdrantClient({ url: runtime.baseUrl });

    ipcMain.handle("qdrant:get-collections", async () => {
        return client.getCollections();
    });

    ipcMain.handle("qdrant:create-collection", async (_e, name, size, distance = "Cosine") => {
        return client.createCollection(name, {
            vectors: { size, distance }
        });
    });

    ipcMain.handle("qdrant:upsert", async (_e, collection, points) => {
        return client.upsert(collection, { points });
    });

    ipcMain.handle("qdrant:search", async (_e, collection, vector, limit = 5, filter) => {
        return client.search(collection, { vector, limit, filter });
    });

    ipcMain.handle("qdrant:delete-collection", async (_e, name) => {
        return client.deleteCollection(name);
    });

    ipcMain.handle("qdrant:update-point", async (_e, collection, pointId, vector, payload = {}) => {
        try {
            const result = await client.upsert(collection, {
                points: [
                    {
                        id: pointId,
                        vector,
                        payload
                    }
                ]
            });
            return { success: true, result };
        } catch (error) {
            console.error("Error updating point:", error);
            return { success: false, error: error.message };
        }
    });

    // Update payload only (no vector overwrite)
    ipcMain.handle("qdrant:update-payload", async (_e, collection, pointId, payload) => {
        try {
            const result = await client.setPayload(collection, {
                payload,
                points: [pointId]
            });
            return { success: true, result };
        } catch (error) {
            console.error("Error updating payload:", error);
            return { success: false, error: error.message };
        }
    });

    // Update vector only (keep existing payload)
    ipcMain.handle("qdrant:update-vector", async (_e, collection, pointId, vector) => {
        try {
            const result = await client.updateVectors(collection, {
                points: [
                    {
                        id: pointId,
                        vector
                    }
                ]
            });
            return { success: true, result };
        } catch (error) {
            console.error("Error updating vector:", error);
            return { success: false, error: error.message };
        }
    });

    // Updated bulk sync handler to support journals, goals, and progress logs
    ipcMain.handle("qdrant:bulk-sync", async () => {
        try {
            if (global.qdrantWorker) {
                // Trigger bulk sync for all types
                global.qdrantWorker.postMessage({ type: 'journal:bulk-sync-requested' });
                global.qdrantWorker.postMessage({ type: 'goal:bulk-sync-requested' });
                global.qdrantWorker.postMessage({ type: 'progress_log:bulk-sync-requested' });
                console.log('IPC Handler: Bulk sync messages sent to worker for journals, goals, and progress logs');
            } else {
                console.error('Qdrant worker not available');
                return { success: false, error: "Worker not available" };
            }
            return { success: true, message: "Bulk sync started for all types" };
        } catch (error) {
            console.error("Error starting bulk sync:", error);
            return { success: false, error: error.message };
        }
    });

    // Add single journal sync handler
    ipcMain.handle("qdrant:sync-journal", async (_e, journalId) => {
        try {
            console.log(`IPC Handler: Received request to sync journal ID ${journalId}`);
            if (global.qdrantWorker) {
                global.qdrantWorker.postMessage({
                    type: 'journal:sync-requested',
                    data: { journalId }
                });
                console.log(`IPC Handler: Message sent to worker for journal ID ${journalId}`);
            } else {
                console.error('Qdrant worker not available');
                return { success: false, error: "Worker not available" };
            }
            return { success: true, message: "Journal sync started" };
        } catch (error) {
            console.error("Error starting journal sync:", error);
            return { success: false, error: error.message };
        }
    });

    // **NEW**: Add single goal sync handler
    ipcMain.handle("qdrant:sync-goal", async (_e, goalId) => {
        try {
            console.log(`IPC Handler: Received request to sync goal ID ${goalId}`);
            if (global.qdrantWorker) {
                global.qdrantWorker.postMessage({
                    type: 'goal:sync-requested',
                    data: { goalId }
                });
                console.log(`IPC Handler: Message sent to worker for goal ID ${goalId}`);
            } else {
                console.error('Qdrant worker not available');
                return { success: false, error: "Worker not available" };
            }
            return { success: true, message: "Goal sync started" };
        } catch (error) {
            console.error("Error starting goal sync:", error);
            return { success: false, error: error.message };
        }
    });

    // **NEW**: Add single progress log sync handler
    ipcMain.handle("qdrant:sync-progress-log", async (_e, progressLogId) => {
        try {
            console.log(`IPC Handler: Received request to sync progress log ID ${progressLogId}`);
            if (global.qdrantWorker) {
                global.qdrantWorker.postMessage({
                    type: 'progress_log:sync-requested',
                    data: { progressLogId }
                });
                console.log(`IPC Handler: Message sent to worker for progress log ID ${progressLogId}`);
            } else {
                console.error('Qdrant worker not available');
                return { success: false, error: "Worker not available" };
            }
            return { success: true, message: "Progress log sync started" };
        } catch (error) {
            console.error("Error starting progress log sync:", error);
            return { success: false, error: error.message };
        }
    });
}