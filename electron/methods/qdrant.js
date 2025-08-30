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

    // Add bulk sync handler
    ipcMain.handle("qdrant:bulk-sync", async () => {
        try {
            // Emit the bulk sync event to the worker
            eventBus.emit("journal:bulk-sync-requested");
            return { success: true, message: "Bulk sync started" };
        } catch (error) {
            console.error("Error starting bulk sync:", error);
            return { success: false, error: error.message };
        }
    });
}
