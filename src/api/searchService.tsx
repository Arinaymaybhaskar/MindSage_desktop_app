import type {
  SearchHit,
  SearchStatus,
  SearchSyncResult,
  SearchUnavailable,
} from "../types/Search";

const checkElectron = () => {
  if (!window.electron?.ipcRenderer) {
    throw new Error("Not in an Electron environment.");
  }
};

export type SearchSourceType = "journal" | "goal" | "progress_log";

export const searchService = {
  /** Nearest entries, goals and progress logs of the signed-in user. */
  search: (
    query: string,
    limit = 5,
  ): Promise<SearchHit[] | SearchUnavailable> => {
    checkElectron();
    return window.electron.ipcRenderer.invoke("search:query", query, limit);
  },
  /** Looks for anything still without a vector and indexes it. */
  bulkSync: (): Promise<SearchSyncResult> => {
    checkElectron();
    return window.electron.ipcRenderer.invoke("search:bulk-sync");
  },
  /** Asks for one item to be indexed again (the Retry button). */
  syncItem: (type: SearchSourceType, id: number): Promise<SearchSyncResult> => {
    checkElectron();
    return window.electron.ipcRenderer.invoke("search:sync", type, id);
  },
  status: (): Promise<SearchStatus> => {
    checkElectron();
    return window.electron.ipcRenderer.invoke("search:status");
  },
};
