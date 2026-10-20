/**
 * The installed-model list behind Settings > Models (`ollama:models`).
 *
 * It used to run `execSync("ollama list")` on the main process with no
 * timeout, so an Ollama that accepted the connection and never answered froze
 * every window and even `app.close` (KAN-369). It now asks Ollama's HTTP API
 * (`/api/tags`, then `/api/show` per model) with an abort timeout on every
 * request, and never blocks the event loop while it waits.
 *
 * Pure on purpose (no `electron`, no database): `fetch` is injected, so the
 * timeout behaviour is unit-tested with fake timers in `ollamaList.test.js`.
 */

export const OLLAMA_HOST = "http://127.0.0.1:11434";

/** How long `/api/tags` may take before the list reports "not responding". */
export const LIST_TIMEOUT_MS = 5000;
/** How long each `/api/show` may take before that model keeps its basic row. */
export const SHOW_TIMEOUT_MS = 8000;

export const NOT_RESPONDING = "Ollama is not responding.";
export const NOT_RUNNING = "Ollama is not running.";
export const BAD_REPLY = "Ollama sent a reply MindSage could not read.";

/**
 * Formats bytes the way `ollama list` prints its SIZE column (decimal units,
 * one decimal place below 10), so the Models screen shows what it did before.
 */
export const humanBytes = (bytes) => {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return "";
  const units = [
    [1e12, "TB"],
    [1e9, "GB"],
    [1e6, "MB"],
    [1e3, "KB"],
  ];
  for (const [size, unit] of units) {
    if (n >= size) {
      const value = n / size;
      if (value >= 10 || value === Math.trunc(value)) {
        return `${Math.trunc(value)} ${unit}`;
      }
      return `${value.toFixed(1)} ${unit}`;
    }
  }
  return `${Math.trunc(n)} B`;
};

/**
 * One `/api/tags` entry in the row shape the renderer already reads.
 *
 * The old parser split `ollama list` (NAME, ID, SIZE, MODIFIED) and took the
 * second and third columns as `size` and `modified`, so `size` held the short
 * ID and `modified` held the size; `ModelSettings` compensates by reading the
 * size from `modified` and the date from `/api/show`. The wire shape is kept
 * exactly as it was, quirk included, so the screen is unchanged.
 */
const toRow = (m) => ({
  name: m.name ?? m.model,
  size: typeof m.digest === "string" ? m.digest.slice(0, 12) : "",
  modified: humanBytes(m.size),
});

/**
 * An abort signal that fires after `ms`. Built on the global `setTimeout`
 * rather than `AbortSignal.timeout` so fake timers drive it in tests; the
 * caller clears it once the reply (body included) has been read.
 */
const deadline = (ms) => {
  const controller = new AbortController();
  const state = { timedOut: false };
  const timer = setTimeout(() => {
    state.timedOut = true;
    controller.abort(new Error(`Timed out after ${ms} ms`));
  }, ms);
  return { signal: controller.signal, state, clear: () => clearTimeout(timer) };
};

/** Drops the very large tokenizer and tensor fields `/api/show` returns. */
const trimShowInfo = (info) => {
  if (info && info.model_info) {
    delete info.model_info["tokenizer.ggml.merges"];
    delete info.model_info["tokenizer.ggml.scores"];
    delete info.model_info["tokenizer.ggml.token_type"];
    delete info.model_info["tokenizer.ggml.tokens"];
    delete info["tensors"];
    delete info["modelfile"];
    delete info["license"];
  }
  return info;
};

/**
 * Lists the installed models, each enriched with its `/api/show` info when
 * that answers in time.
 *
 * Resolves (never rejects) with either the rows or
 * `{ error, reason }`, where `reason` is `"timeout"` (Ollama accepted the
 * connection but did not answer within `timeoutMs`), `"unreachable"` (nothing
 * listening: not installed or not started) or `"bad-response"`.
 */
export async function listOllamaModels({
  fetchImpl = globalThis.fetch,
  host = OLLAMA_HOST,
  timeoutMs = LIST_TIMEOUT_MS,
  showTimeoutMs = SHOW_TIMEOUT_MS,
  onShowError,
} = {}) {
  let tags;
  const list = deadline(timeoutMs);
  try {
    // The race makes the deadline hold even if a fetch ignored its signal.
    tags = await Promise.race([
      (async () => {
        const res = await fetchImpl(`${host}/api/tags`, {
          signal: list.signal,
        });
        if (!res.ok) return { badStatus: res.status };
        return res.json();
      })(),
      new Promise((_, reject) =>
        list.signal.addEventListener("abort", () => reject(list.signal.reason)),
      ),
    ]);
  } catch (err) {
    if (list.state.timedOut) {
      return { error: NOT_RESPONDING, reason: "timeout" };
    }
    if (err instanceof SyntaxError) {
      return { error: BAD_REPLY, reason: "bad-response" };
    }
    return { error: NOT_RUNNING, reason: "unreachable" };
  } finally {
    list.clear();
  }
  if (!tags || tags.badStatus || !Array.isArray(tags.models)) {
    return { error: BAD_REPLY, reason: "bad-response" };
  }

  const rows = tags.models.map(toRow).filter((row) => row.name);

  return Promise.all(
    rows.map(async (row) => {
      const show = deadline(showTimeoutMs);
      try {
        const info = await Promise.race([
          (async () => {
            const res = await fetchImpl(`${host}/api/show`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ model: row.name, verbose: true }),
              signal: show.signal,
            });
            return res.json();
          })(),
          new Promise((_, reject) =>
            show.signal.addEventListener("abort", () =>
              reject(show.signal.reason),
            ),
          ),
        ]);
        return { ...row, info: trimShowInfo(info) };
      } catch (err) {
        onShowError?.(row.name, err);
        return row; // the basic row, as before
      } finally {
        show.clear();
      }
    }),
  );
}
