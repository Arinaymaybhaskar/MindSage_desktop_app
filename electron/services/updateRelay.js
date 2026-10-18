// What the updater tells the window, and what it remembers so a window that
// loads late (or reloads) can ask instead of missing the events. Pure, so it
// is testable without Electron or electron-updater.
//
//   idle -> available -> downloading -> ready
//                    \-> error          (a failed download; ready is final)

export const UPDATE_ERROR_MESSAGE =
  "The update could not be downloaded. MindSage will try again the next time you check.";

/**
 * @param {(channel: string, payload: object) => void} send
 */
export function createUpdateRelay(send) {
  let state = { phase: "idle" };

  const set = (next, channel, payload) => {
    state = next;
    send(channel, payload);
  };

  return {
    getState: () => state,
    canInstall: () => state.phase === "ready",

    available(info) {
      // A downloaded update stays the one to install.
      if (state.phase === "ready") return;
      const version = info?.version;
      set({ phase: "available", version }, "update:available", { version });
    },

    progress(p) {
      if (state.phase === "ready") return;
      const percent = Math.min(100, Math.max(0, Math.round(p?.percent ?? 0)));
      set(
        { phase: "downloading", version: state.version, percent },
        "update:progress",
        { percent },
      );
    },

    downloaded(info) {
      const version = info?.version ?? state.version;
      set({ phase: "ready", version }, "update:downloaded", { version });
    },

    failed() {
      // A later failed check must not take away an update that is ready.
      if (state.phase === "ready") return;
      set(
        {
          phase: "error",
          version: state.version,
          message: UPDATE_ERROR_MESSAGE,
        },
        "update:error",
        { message: UPDATE_ERROR_MESSAGE },
      );
    },
  };
}
