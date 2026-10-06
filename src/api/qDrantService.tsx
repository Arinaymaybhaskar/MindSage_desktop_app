import type {
  QdrantCollectionsResponse,
  QdrantPoint,
  QdrantSyncResult,
} from "../types/Qdrant";

const checkElectron = () => {
  if (!window.electron?.ipcRenderer) {
    throw new Error("Not in an Electron environment.");
  }
};

type Distance = "Cosine" | "Dot" | "Euclid";

export const qdrantService = {
  listCollections: (): Promise<QdrantCollectionsResponse> => {
    checkElectron();
    return window.electron.ipcRenderer.invoke("qdrant:get-collections");
  },
  createCollection: (
    name: string,
    size = 384,
    distance: Distance = "Cosine",
  ) => {
    checkElectron();
    return window.electron.ipcRenderer.invoke(
      "qdrant:create-collection",
      name,
      size,
      distance,
    );
  },
  addPoints: (collection: string, points: QdrantPoint[]) => {
    checkElectron();
    return window.electron.ipcRenderer.invoke(
      "qdrant:upsert",
      collection,
      points,
    );
  },
  search: (
    token: string,
    collection: string,
    query: string,
    limit = 5,
    filter?: Record<string, unknown>,
  ): Promise<QdrantPoint[] | { success: false; error: string }> => {
    checkElectron();
    return window.electron.ipcRenderer.invoke(
      "qdrant:search",
      token,
      collection,
      query,
      limit,
      filter,
    );
  },
  deleteCollection: (name: string) => {
    checkElectron();
    return window.electron.ipcRenderer.invoke("qdrant:delete-collection", name);
  },
  bulkSync: (): Promise<QdrantSyncResult> => {
    checkElectron();
    return window.electron.ipcRenderer.invoke("qdrant:bulk-sync");
  },
  syncJournal: (journalId: number): Promise<QdrantSyncResult> => {
    checkElectron();
    return window.electron.ipcRenderer.invoke("qdrant:sync-journal", journalId);
  },
  // **NEW**
  syncGoal: (goalId: number): Promise<QdrantSyncResult> => {
    checkElectron();
    return window.electron.ipcRenderer.invoke("qdrant:sync-goal", goalId);
  },
  // **NEW**
  syncProgressLog: (progressLogId: number): Promise<QdrantSyncResult> => {
    checkElectron();
    return window.electron.ipcRenderer.invoke(
      "qdrant:sync-progress-log",
      progressLogId,
    );
  },
};
