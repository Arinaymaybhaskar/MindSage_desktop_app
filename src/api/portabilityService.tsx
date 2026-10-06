// Export the journal for other apps, and import what other apps export.
// Handlers: electron/methods/portability.js.

export type ExportFormat =
  "mindsage" | "markdown" | "dayone" | "csv" | "enex" | "text";

export interface ExportResult {
  success: boolean;
  count?: number;
  missingMedia?: number;
}

export interface ImportPreview {
  canceled: boolean;
  files?: string[];
  format?: string | null;
  formatName?: string | null;
  total?: number;
  toImport?: number;
  duplicates?: number;
  from?: string | null;
  to?: string | null;
  withPhotos?: number;
  withAudio?: number;
  extraMedia?: number;
  warnings?: string[];
  moreWarnings?: number;
}

const invoke = <T,>(channel: string, ...args: unknown[]) =>
  window.electron.ipcRenderer.invoke<T>(channel, ...args);

export const portabilityService = {
  /** Asks where to save; resolves with the chosen path or null. */
  pickExportPath: async (format: ExportFormat): Promise<string | null> => {
    const r = await invoke<{ canceled: boolean; filePath?: string }>(
      "data:pick-export-path",
      format,
    );
    return r.canceled || !r.filePath ? null : r.filePath;
  },
  exportJournal: (format: ExportFormat, destinationPath: string) =>
    invoke<ExportResult>("data:export", { format, destinationPath }),
  /** Opens a file picker, reads what was chosen, and previews it. */
  pickImport: () => invoke<ImportPreview>("data:import-pick"),
  /** Reads files dropped onto the Import panel, and previews them. */
  readImport: (paths: string[]) =>
    invoke<ImportPreview>("data:import-read", paths),
  commitImport: () => invoke<{ imported: number }>("data:import-commit"),
  undoImport: () => invoke<{ removed: number }>("data:import-undo"),
};
