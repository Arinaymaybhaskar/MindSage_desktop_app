import type {
  EntryMentions,
  MentionFix,
  PeopleInbox,
  PeopleStatus,
  PersonCard,
  PersonDetail,
  PersonSummary,
  Relationship,
} from "../types/People";

const checkElectron = () => {
  if (!window.electron?.ipcRenderer) {
    throw new Error("Not in an Electron environment.");
  }
};

const invoke = <T,>(channel: string, ...args: unknown[]): Promise<T> => {
  checkElectron();
  return window.electron.ipcRenderer.invoke<T>(channel, ...args);
};

type Ok = { success: boolean };

export const peopleService = {
  getStatus: () => invoke<PeopleStatus>("people:get-status"),
  setEnabled: (enabled: boolean, options: { deleteData?: boolean } = {}) =>
    invoke<PeopleStatus>("people:set-enabled", enabled, options),
  setPaused: (paused: boolean) =>
    invoke<PeopleStatus>("people:set-paused", paused),
  retryFailed: () => invoke<{ requeued: number }>("people:retry-failed"),

  list: () => invoke<PersonCard[]>("people:list"),
  get: (personId: number) => invoke<PersonDetail>("people:get", personId),
  summarize: (personId: number) =>
    invoke<PersonSummary>("people:summarize", personId),
  getInbox: () => invoke<PeopleInbox>("people:get-inbox"),

  confirm: (
    personId: number,
    fields: { displayName?: string; relationship?: Relationship | null } = {},
  ) => invoke<Ok>("people:confirm", personId, fields),
  ignore: (personId: number) => invoke<Ok>("people:ignore", personId),
  remove: (personId: number, options: { ignoreName?: boolean } = {}) =>
    invoke<Ok>("people:delete", personId, options),
  update: (
    personId: number,
    fields: { displayName?: string; relationship?: Relationship | null },
  ) => invoke<Ok>("people:update", personId, fields),
  addAlias: (personId: number, alias: string) =>
    invoke<Ok>("people:add-alias", personId, alias),
  removeAlias: (personId: number, alias: string) =>
    invoke<Ok>("people:remove-alias", personId, alias),
  merge: (keepId: number, mergeId: number) =>
    invoke<Ok & { undoToken: string }>("people:merge", keepId, mergeId),
  undoMerge: (token: string) => invoke<Ok>("people:undo-merge", token),

  entryMentions: (entryId: number) =>
    invoke<EntryMentions>("people:entry-mentions", entryId),
  fixMention: (mentionId: number, fix: MentionFix) =>
    invoke<Ok>("people:fix-mention", mentionId, fix),

  /** Fires whenever People data changes in the main process. */
  onChanged: (callback: () => void): Unsubscribe =>
    window.electron?.ipcRenderer?.on("people:changed", callback) ?? (() => {}),
};
