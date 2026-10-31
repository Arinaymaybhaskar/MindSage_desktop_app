// Local AI setup states (KAN-78, KAN-87). One state machine over the shared
// model downloader: it checks memory, disk and the model host, asks once about
// a metered connection, downloads, and retries by itself after a network
// drop. Nothing here gates writing: setup runs in the background and a failed
// or unfinished setup only means AI features wait. Pure: everything it touches
// is passed in.
import { BUILTIN_MODELS, EMBED_MODEL } from "./models.js";
import { downloadSpace, downloadWarning } from "./picker.js";

export const REACH_TIMEOUT_MS = 5000;
/** Retry waits after a drop; the last one repeats. */
export const BACKOFF_MS = [5_000, 15_000, 45_000, 120_000, 300_000];
export const OLLAMA_REGISTRY = "https://registry.ollama.ai/v2/";
/** shortcut: the Ollama embedding model size is the built-in one's (same weights). */
export const OLLAMA_PULL_BYTES = BUILTIN_MODELS[EMBED_MODEL].bytes;

/**
 * Whether `url` answers, within 5 s. A 407 is a proxy asking for sign-in
 * ("work-network"); an HTML page where a file host should answer is a captive
 * portal, which counts as offline; no answer or a 5xx is offline.
 *
 * @returns {Promise<"ok" | "offline" | "work-network">}
 */
export async function checkReachable(url, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(url, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(REACH_TIMEOUT_MS),
    });
    if (res.status === 407) return "work-network";
    if (res.status >= 500) return "offline";
    if (res.headers.get("content-type")?.includes("text/html"))
      return "offline";
    return "ok";
  } catch (err) {
    return /proxy|407/i.test(String(err?.cause?.message ?? err?.message))
      ? "work-network"
      : "offline";
  }
}

/**
 * @param {{
 *   provider: () => "builtin" | "ollama" | "external", external: nothing to download
 *   plan: () => string[],            built-in model ids still to download, in order
 *   chatId: () => string,
 *   totalMem: () => number,
 *   freeDisk: (id: string) => number,
 *   partBytes: (id: string) => number,
 *   download: (id: string) => Promise<{ success?: boolean, error?: string,
 *     paused?: boolean, cancelled?: boolean }>,
 *   pauseDownload: () => Promise<unknown>,
 *   reachable: (url: string) => Promise<"ok" | "offline" | "work-network">,
 *   hostFor: (id: string) => string, the host the model really comes from
 *   probeFor: (id: string) => string, the file URL to probe (a host's home page is HTML)
 *   pullOllama?: () => void,
 *   asked: { get: () => boolean | undefined, set: (waitForWifi: boolean) => void },
 *   lowMemoryOk?: { get: () => boolean | undefined, set: (ok: boolean) => void },
 *   onReady: () => Promise<void> | void,
 *   onChange: (state: object) => void,
 *   log?: { info: Function, warn: Function } }} deps
 */
export function createSetup(deps) {
  let state = { state: "idle" };
  let running = false;
  let retryTimer = null;
  let attempt = 0; // network retries since the last good download
  let ticket = 0; // a newer start/pause makes an older run stop quietly
  let lowMemoryOk = deps.lowMemoryOk?.get() === true; // "Download anyway" holds for retries and relaunches; it says nothing about metered

  const set = (next) => {
    state = { ...next };
    deps.onChange(state);
    return state;
  };

  const clearRetry = () => {
    clearTimeout(retryTimer);
    retryTimer = null;
  };

  function scheduleRetry(reason) {
    clearRetry();
    const wait = BACKOFF_MS[Math.min(attempt++, BACKOFF_MS.length - 1)];
    retryTimer = setTimeout(() => api.start(), wait);
    retryTimer.unref?.();
    return set({ ...reason, retryInMs: wait });
  }

  async function runBuiltin(mine) {
    const ids = deps.plan();
    if (!ids.length) return;
    const chat = deps.chatId();
    const warning = downloadWarning(chat, deps.totalMem());
    if (warning && !lowMemoryOk) {
      return set({ state: "low-memory", warning, modelId: chat });
    }
    // One disk check for the whole plan; a half-done .part counts as done.
    let need = 0;
    let free = Infinity;
    for (const id of ids) {
      const space = downloadSpace(id, deps.freeDisk(id), deps.partBytes(id));
      need += space.need;
      free = Math.min(free, space.free);
    }
    if (need > free) {
      return set({ state: "low-disk", needBytes: need, freeBytes: free });
    }
    const host = deps.hostFor(ids[0]);
    const reach = await deps.reachable(deps.probeFor(ids[0]));
    if (mine !== ticket) return;
    if (reach === "work-network")
      return set({ state: "work-network", host, sizeBytes: need });
    if (reach === "offline")
      return scheduleRetry({ state: "offline", host, sizeBytes: need });
    // Only "Download now" (asked === false) lets a download start; retries and relaunches obey it too.
    if (deps.asked.get() === undefined) {
      return set({ state: "metered", sizeBytes: need });
    }
    if (deps.asked.get() === true) {
      return set({ state: "paused", reason: "wifi" });
    }

    for (const id of ids) {
      const spec = BUILTIN_MODELS[id];
      let mismatches = 0;
      for (;;) {
        set({ state: "downloading", modelId: id, label: spec.label, done: 0 });
        const res = await deps.download(id);
        if (mine !== ticket) return;
        if (res.success) break;
        if (res.paused || res.cancelled) {
          return set({ state: "paused", modelId: id, reason: "user" });
        }
        if (/checksum mismatch/i.test(res.error ?? "")) {
          // The downloader already deleted the bad part; one clean retry.
          if (mismatches++ === 0) continue;
          deps.log?.warn("Model checksum failed twice", { id });
          return set({
            state: "failed",
            modelId: id,
            error: `${spec.label} came down damaged twice. Try again later or on another network.`,
          });
        }
        // A drop mid-download: the .part stays and the retry resumes it.
        const again = await deps.reachable(deps.probeFor(id));
        if (mine !== ticket) return;
        if (again === "work-network") {
          return set({ state: "work-network", host: deps.hostFor(id) });
        }
        if (again === "offline") {
          return scheduleRetry({ state: "offline", host: deps.hostFor(id) });
        }
        return set({ state: "failed", modelId: id, error: res.error });
      }
    }
    attempt = 0;
    set({ state: "starting" });
    await deps.onReady();
    return set({ state: "ready" });
  }

  async function runOllama(mine) {
    const reach = await deps.reachable(OLLAMA_REGISTRY);
    if (mine !== ticket) return;
    const base = { host: OLLAMA_REGISTRY, sizeBytes: OLLAMA_PULL_BYTES };
    if (reach === "work-network")
      return set({ state: "work-network", ...base });
    if (reach === "offline")
      return scheduleRetry({ state: "offline", ...base });
    attempt = 0;
    // Ollama's own setup pulls the model; this only held it back until the registry answers.
    deps.pullOllama?.();
    return set({ state: "starting", ...base });
  }

  const api = {
    getState: () => state,
    /** Safe to call at any time; a call while a run is active does nothing. */
    async start(opts = {}) {
      if (running) return state;
      running = true;
      if (opts.lowMemoryOk) {
        lowMemoryOk = true;
        deps.lowMemoryOk?.set(true);
      }
      clearRetry();
      const mine = ++ticket;
      try {
        set({ state: "starting" });
        const kind = deps.provider();
        if (kind === "ollama") await runOllama(mine);
        else if (kind === "external" || !deps.plan().length)
          set({ state: "ready" });
        else await runBuiltin(mine);
      } catch (err) {
        // The message is the downloader's or the engine's; never entry text.
        deps.log?.warn("Local AI setup failed", { error: err.message });
        set({ state: "failed", error: String(err.message).slice(0, 200) });
      } finally {
        running = false;
      }
      return state;
    },
    async pause() {
      clearRetry();
      ticket++;
      await deps.pauseDownload();
      return set({ state: "paused", reason: "user" });
    },
    /** The metered question, asked once: wait for Wi-Fi or download now. */
    answerMetered(waitForWifi) {
      deps.asked.set(waitForWifi === true);
      return waitForWifi === true
        ? set({ state: "paused", reason: "wifi" })
        : api.start();
    },
    /** The network came back (the window's online event): retry without waiting out the backoff. */
    online() {
      if (state.state !== "offline") return state;
      attempt = 0;
      return api.start();
    },
  };
  return api;
}
