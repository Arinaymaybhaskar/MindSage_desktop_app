// Restart Local AI (KAN-71). Built-in: dispose and reload the engine. Ollama:
// the app starts it detached and keeps no handle, so it is not restartable
// here and the state is reported instead. Background jobs wait in the shared
// queue while it runs and finish afterwards; saving an entry never touches
// this path. Pure: everything it touches is passed in.

/**
 * @param {{ provider: () => "builtin" | "ollama",
 *   reloadBuiltin: () => Promise<void>,
 *   ollamaRunning: () => Promise<boolean>,
 *   queue: { pause: () => void, resume: () => void },
 *   pauseDownload: () => Promise<string | null>,
 *   resumeDownload: (id: string) => void,
 *   onChange?: (status: object) => void,
 *   log?: { error: (m: string, d?: object) => void } }} deps
 */
export function createRestarter(deps) {
  let status = { state: "ready", provider: null, managed: true };
  let running = false;
  const set = (next) => {
    status = { ...status, details: undefined, ...next };
    deps.onChange?.(status);
  };

  async function run() {
    const provider = deps.provider();
    if (provider === "ollama") {
      // shortcut: no spawn handle is kept for Ollama; upgrade when the app owns the process.
      const up = await deps.ollamaRunning();
      set({
        state: up ? "ready" : "error",
        provider,
        managed: false,
        details: up
          ? "Ollama is not managed by MindSage, so it was not restarted. It is running."
          : "Ollama is not managed by MindSage and is not running. Start it yourself.",
      });
      return;
    }
    set({ state: "starting", provider, managed: true });
    deps.queue.pause();
    let resumeId = null;
    try {
      resumeId = await deps.pauseDownload();
      await deps.reloadBuiltin();
      set({ state: "ready" });
    } catch (err) {
      // The message is the engine's own; it never carries entry or chat text.
      deps.log?.error("Restart Local AI failed", { error: err.message });
      set({ state: "error", details: String(err.message).slice(0, 200) });
    } finally {
      deps.queue.resume();
      if (resumeId) deps.resumeDownload(resumeId);
    }
  }

  return {
    getStatus: () => status,
    /** A call while one is running does nothing and returns the current status. */
    async restart() {
      if (running) return status;
      running = true;
      try {
        await run();
      } finally {
        running = false;
      }
      return status;
    },
  };
}
