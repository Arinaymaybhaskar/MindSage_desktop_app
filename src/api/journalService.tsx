// --- Type Definitions ---

export interface JournalEntry {
  id?: number;
  title: string;
  content: string;
  mood_score?: number;
  sentiment_score?: number;
  mood_tags?: string;
  created_at?: string;
  image_key?: string;
  audio_key?: string;
  transcription?: string;
  content_summary?: string;
  tags?: string[];
  synced_to_qdrant?:
    | "not_synced"
    | "pending"
    | "in_progress"
    | "success"
    | "failed";
  ai_metadata_status?: "not_started" | "pending" | "completed" | "failed";
  ai_summary_status?: "not_started" | "pending" | "completed" | "failed" | "skipped";
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
    mode: "online" | "offline",
    token: string,
    page: number = 0,
    limit: number = 10
  ): Promise<JournalEntry[]> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "journal:get-all",
      mode,
      token,
      page,
      limit
    );
  },

  /**
   * Fetches a single journal entry by its ID.
   */
  getOne: async (
    mode: "online" | "offline",
    token: string,
    id: number
  ): Promise<JournalEntry> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "journal:get-by-id",
      mode,
      token,
      id
    );
  },

  /**
   * Creates a new journal entry.
   */
  create: async (
    mode: "online" | "offline",
    token: string,
    data: JournalEntry
  ): Promise<{ journalId: number; userId: number }> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "journal:create",
      mode,
      token,
      data
    );
  },

  /**
   * Updates an existing journal entry.
   */
  update: async (
    mode: "online" | "offline",
    token: string,
    id: number,
    data: JournalEntry
  ): Promise<JournalEntry> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "journal:update",
      mode,
      token,
      id,
      data
    );
  },

  /**
   * Deletes a journal entry.
   */
  remove: async (
    mode: "online" | "offline",
    token: string,
    id: number
  ): Promise<{ message: string }> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "journal:delete",
      mode,
      token,
      id
    );
  },

  /**
   * Fetches mood scores for a given date range.
   */
  getMoodRange: async (
    mode: "online" | "offline",
    token: string,
    range: number
  ): Promise<MoodScoreData[]> => {
    checkElectron();
    // Assuming you have a 'journal:get-mood-scores' handler
    return await window.electron.ipcRenderer.invoke(
      "journal:get-mood-scores",
      mode,
      token,
      range
    );
  },
  getRecent: async (authMode: string, token: string) => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "journal:get-recent",
      authMode,
      token
    );
  },

  getImages: async (authMode: string, token: string, mode: string) => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "journal:get-images",
      authMode,
      token,
      mode
    );
  },

  /**
   * Sends a query to the AI chat. Online only.
   */
  chat: async (token: string, query: string): Promise<{ answer: string }> => {
    checkElectron();
    // Chat is an online-only feature, so we hardcode the mode.
    return await window.electron.ipcRenderer.invoke(
      "chat:send",
      "online",
      token,
      { query }
    );
  },

  /**
   * Gets a pre-signed URL for uploading media. Online only.
   */
  getUploadUrl: async (token: string, type: string, postId: string) => {
    checkElectron();
    // This is an online-only feature.
    return await window.electron.ipcRenderer.invoke(
      "media:get-upload-url",
      "online",
      token,
      { type, postId }
    );
  },

  /**
   * Gets a temporary URL for viewing media. Online only.
   */
  getMediaUrl: async (token: string, key: string) => {
    checkElectron();
    // This is an online-only feature.
    // You would need to add a 'media:get-media-url' IPC handler.
    // return await window.electron.ipcRenderer.invoke('media:get-media-url', 'online', token, key);
    console.warn(
      "getMediaUrl is an online-only feature and not fully implemented in this mock."
    );
    return Promise.resolve({
      url: `https://s3-media-url.com/${encodeURIComponent(key)}`,
    });
  },
  getChartData: async (authMode: string, token: string, range: number) => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "journal:get-chart-data",
      authMode,
      token,
      range
    );
  },

  retryAIMetadata: async (
    token: string,
    journalId: number,
    type: "metadata" | "summary"
  ): Promise<{ success: boolean; error?: string; skipped?: boolean }> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "journal:retry-ai-metadata",
      token,
      journalId,
      type
    );
  },
};

// --- FIX: Add a default export ---
export default journalService;
