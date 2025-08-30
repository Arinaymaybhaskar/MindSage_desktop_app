const checkElectron = () => {
  if (!window.electron?.ipcRenderer) {
    throw new Error("Not in an Electron environment.");
  }
};

type Distance = "Cosine" | "Dot" | "Euclid";

export const qdrantService = {
  listCollections: () => {
    checkElectron();
    return window.electron.ipcRenderer.invoke("qdrant:get-collections");
  },
  createCollection: (
    name: string,
    size = 384,
    distance: Distance = "Cosine"
  ) => {
    checkElectron();
    return window.electron.ipcRenderer.invoke(
      "qdrant:create-collection",
      name,
      size,
      distance
    );
  },
  addPoints: (collection: string, points: any[]) => {
    checkElectron();
    return window.electron.ipcRenderer.invoke(
      "qdrant:upsert",
      collection,
      points
    );
  },
  search: (collection: string, vector: number[], limit = 5, filter?: any) => {
    checkElectron();
    return window.electron.ipcRenderer.invoke(
      "qdrant:search",
      collection,
      vector,
      limit,
      filter
    );
  },
  deleteCollection: (name: string) => {
    checkElectron();
    return window.electron.ipcRenderer.invoke("qdrant:delete-collection", name);
  },
};
