// The order the main process brings services up in, with every dependency
// passed in so it can be tested without Electron.
//
// The vector index used to share one try block with IPC registration, so a
// Qdrant failure (seen with a data path over Windows' 260-character limit)
// left sign-in, writing and settings with no handlers at all. Now handlers
// register first and unconditionally, the window is always told services are
// ready, and a failed index start is retried in the background so search can
// come back without a restart.

export const INDEX_RETRY_DELAYS_MS = [10_000, 30_000, 60_000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {object} deps
 * @param {() => void} deps.registerHandlers  IPC handlers and event bus; must not depend on the index.
 * @param {() => Promise<object>} deps.startIndex  Starts the vector index and resolves its runtime.
 * @param {(runtime: object) => void} deps.onIndexReady  Wires the runtime in (client, worker).
 * @param {(status: {degraded: boolean, search: boolean}) => void} deps.onStatus  Tells the window.
 * @param {(message: string) => void} [deps.log]
 * @param {() => void} [deps.onCatchUp]  Called once when the index comes up on a retry (never on a normal start), to index what was saved while it was down.
 * @param {number[]} [deps.retryDelaysMs]
 * @param {(ms: number) => Promise<void>} [deps.wait]
 * @returns {Promise<{degraded: boolean, search: boolean, retry: Promise<boolean>}>}
 *   `retry` settles once background retries end: true if the index came up.
 */
export async function startServices({
  registerHandlers,
  startIndex,
  onIndexReady,
  onStatus,
  onCatchUp = () => {},
  log = () => {},
  retryDelaysMs = INDEX_RETRY_DELAYS_MS,
  wait = sleep,
}) {
  try {
    registerHandlers();
  } catch (e) {
    log(`IPC handler registration error: ${e?.stack || e}`);
  }

  const tryIndex = async () => {
    const runtime = await startIndex();
    onIndexReady(runtime);
  };

  try {
    await tryIndex();
    const status = { degraded: false, search: true };
    onStatus(status);
    return { ...status, retry: Promise.resolve(true) };
  } catch (e) {
    log(`Vector index failed to start; search unavailable: ${e?.stack || e}`);
  }

  const status = { degraded: true, search: false };
  onStatus(status);

  const retry = (async () => {
    for (const ms of retryDelaysMs) {
      await wait(ms);
      try {
        await tryIndex();
        log("Vector index started on retry; search available");
        onStatus({ degraded: false, search: true });
        // Entries written while it was down were never embedded (KAN-336).
        try {
          onCatchUp();
        } catch (e) {
          log(`Catch-up sync failed to start: ${e?.message || e}`);
        }
        return true;
      } catch (e) {
        log(`Vector index retry failed: ${e?.message || e}`);
      }
    }
    return false;
  })();

  return { ...status, retry };
}
