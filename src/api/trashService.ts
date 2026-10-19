// The trash: entries and goals that were deleted and are kept for 30 days.
// Everything is scoped to the signed-in user in the main process.

export interface TrashedEntry {
  id: number;
  title: string | null;
  preview: string;
  mood_score: number | null;
  has_image: 0 | 1;
  has_audio: 0 | 1;
  created_at: string;
  deleted_at: string;
  days_left: number;
}

export interface TrashedGoal {
  id: number;
  title: string;
  description: string | null;
  current_value: number;
  target_value: number;
  unit: string;
  is_completed: 0 | 1;
  created_at: string;
  deleted_at: string;
  days_left: number;
  /** Progress check-ins that go with it. */
  log_count: number;
}

export interface TrashContents {
  retentionDays: number;
  entries: TrashedEntry[];
  goals: TrashedGoal[];
}

export interface TrashSelection {
  entryIds: number[];
  goalIds: number[];
}

export interface PurgeResult {
  entries: number;
  goals: number;
  files: number;
  /** Items whose search-index points could not be removed yet (index down). */
  searchCleanupPending: number;
  /** Files another program was holding open; retried on the next start. */
  filesPending: number;
}

export interface TrashProgress {
  done: number;
  total: number;
}

const invoke = <T>(channel: string, ...args: unknown[]) =>
  window.electron.ipcRenderer.invoke<T>(channel, ...args);

export const trashService = {
  list: () => invoke<TrashContents>("trash:list"),
  restore: (selection: TrashSelection) =>
    invoke<{ entries: number; goals: number }>("trash:restore", selection),
  deleteForever: (selection: TrashSelection) =>
    invoke<PurgeResult>("trash:delete-forever", selection),
  empty: () => invoke<PurgeResult>("trash:empty"),
  onProgress: (callback: (p: TrashProgress) => void) =>
    window.electron.ipcRenderer.on("trash:progress", callback),
};
