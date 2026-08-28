const checkElectron = () => {
  if (!window.electron?.ipcRenderer) {
    throw new Error("Not in an Electron environment.");
  }
};

/**
 * A service for handling local media operations like saving and opening files.
 */
export const mediaService = {
  /**
   * Opens a dialog for the user to select a file, saves it to a local app
   * directory, and links its path to a specific journal entry.
   * @param journalId - The ID of the journal entry to associate the media with.
   * @param mediaType - The type of media ('image' or 'audio').
   * @returns The local path where the file was stored.
   */
  saveFileForJournal: async (
    journalId: number,
    mediaType: "image" | "audio",
    arrayBuffer: ArrayBuffer,
    filename: string,
  ): Promise<{ success: boolean; key?: string; message?: string }> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke("media:save", {
      journalId,
      mediaType,
      arrayBuffer,
      filename,
    });
  },

  /**
   * Opens a given local file path using the system's default application.
   * @param filePath - The absolute local path to the file.
   */
  openFile: async (filePath: string): Promise<{ success: boolean }> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke("media:open", filePath);
  },
};
