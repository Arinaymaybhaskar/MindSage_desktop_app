// The in-app update state, from the updater in the main process. Quiet by
// design: nothing here starts a check (that is opt-in, in Settings).

export type UpdateState =
  | { phase: "idle" }
  | { phase: "available"; version?: string }
  | { phase: "downloading"; version?: string; percent: number }
  | { phase: "ready"; version?: string }
  | { phase: "error"; version?: string; message: string };

const hasElectron = () => !!window.electron?.ipcRenderer;

export const updateService = {
  getState: async (): Promise<UpdateState> => {
    if (!hasElectron()) return { phase: "idle" };
    return window.electron.ipcRenderer.invoke<UpdateState>("update:get-state");
  },

  /** Restart into the downloaded update. The caller has saved drafts. */
  install: async (): Promise<{ success: boolean; error?: string }> => {
    if (!hasElectron()) return { success: false, error: "Not available" };
    return window.electron.ipcRenderer.invoke("update:install");
  },

  /** Calls back with each new state; returns the unsubscribe. */
  subscribe: (onState: (state: UpdateState) => void): (() => void) => {
    if (!hasElectron()) return () => {};
    const { on } = window.electron.ipcRenderer;
    let current: UpdateState = { phase: "idle" };
    const push = (next: UpdateState) => {
      // A downloaded update stays the one on offer; a later failed check or
      // a newer version appearing must not take the Restart button away.
      if (current.phase === "ready" && next.phase !== "ready") return;
      current = next;
      onState(next);
    };
    const offs = [
      on("update:available", (p: { version?: string }) =>
        push({ phase: "available", version: p?.version }),
      ),
      on("update:progress", (p: { percent: number }) =>
        push({
          phase: "downloading",
          version: "version" in current ? current.version : undefined,
          percent: p?.percent ?? 0,
        }),
      ),
      on("update:downloaded", (p: { version?: string }) =>
        push({ phase: "ready", version: p?.version }),
      ),
      on("update:error", (p: { message: string }) =>
        push({
          phase: "error",
          version: "version" in current ? current.version : undefined,
          message: p?.message,
        }),
      ),
    ];
    return () => offs.forEach((off) => off?.());
  },
};
