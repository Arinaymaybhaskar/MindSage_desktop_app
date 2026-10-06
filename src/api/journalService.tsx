import type { JournalImageEntry } from "../types/Dashboard";

// --- Type Definitions ---

export interface JournalEntry {
  id?: number;
  title: string;
  content: string;
  mood_score?: number;
  sentiment_score?: number;
  mood_tags?: string[];
  created_at?: string;
  image_key?: string | null;
  audio_key?: string | null;
  transcription?: string;
  content_summary?: string;
  tags?: string[];
  synced_to_qdrant?:
    "not_synced" | "pending" | "in_progress" | "success" | "failed";
  ai_metadata_status?: "not_started" | "pending" | "completed" | "failed";
  ai_summary_status?:
    "not_started" | "pending" | "completed" | "failed" | "skipped";
  ai_metadata_error?: string;
  ai_summary_error?: string;
}

interface MoodScoreData {
  mood_score: number;
  created_at: string;
}

const checkElectron = () => {
  if (!window.electron?.ipcRenderer) {
    throw new Error("Not in an Electron environment.");
  }
};

/**
 * A service for handling all journal-related actions for both online and offline modes.
 */
export const journalService = {
  /**
   * Fetches all journal entries for the current user.
   */
  getAll: async (
    token: string,
    page: number = 0,
    limit: number = 10,
  ): Promise<JournalEntry[]> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "journal:get-all",
      token,
      page,
      limit,
    );
  },

  /**
   * Fetches a single journal entry by its ID.
   */
  getOne: async (token: string, id: number): Promise<JournalEntry> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "journal:get-by-id",
      token,
      id,
    );
  },

  /**
   * Creates a new journal entry.
   */
  create: async (token: string, data: JournalEntry): Promise<JournalEntry> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "journal:create",
      token,
      data,
    );
  },

  /**
   * Updates an existing journal entry.
   */
  update: async (
    token: string,
    id: number,
    data: JournalEntry,
  ): Promise<JournalEntry> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "journal:update",
      token,
      id,
      data,
    );
  },

  /**
   * Deletes a journal entry.
   */
  remove: async (token: string, id: number): Promise<{ message: string }> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "journal:delete",
      token,
      id,
    );
  },

  /**
   * Fetches mood scores for a given date range.
   */
  getMoodRange: async (
    token: string,
    range: number,
  ): Promise<MoodScoreData[]> => {
    checkElectron();
    // Assuming you have a 'journal:get-mood-scores' handler
    return await window.electron.ipcRenderer.invoke(
      "journal:get-mood-scores",
      token,
      range,
    );
  },
  getRecent: async (token: string) => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "journal:get-recent",
      token,
    );
  },

  /**
   * `getMode` selects which images come back (for example "all" or
   * "random"). It is unrelated to the removed online/offline auth mode; it
   * was previously also called `mode`, which made the two easy to confuse.
   */
  getImages: async (
    token: string,
    getMode: string,
  ): Promise<JournalImageEntry[]> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "journal:get-images",
      token,
      getMode,
    );
  },

  /**
   * Sends a query to the AI chat.
   */
  chat: async (token: string, query: string): Promise<{ answer: string }> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke("chat:send", token, {
      query,
    });
  },

  getChartData: async (token: string, range: number) => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "journal:get-chart-data",
      token,
      range,
    );
  },

  retryAIMetadata: async (
    token: string,
    journalId: number,
    type: "metadata" | "summary",
  ): Promise<{ success: boolean; error?: string; skipped?: boolean }> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "journal:retry-ai-metadata",
      token,
      journalId,
      type,
    );
  },
};

// --- FIX: Add a default export ---
export default journalService;
