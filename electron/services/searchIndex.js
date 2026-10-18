// Whether the vector index (Qdrant today) can be used. Kept free of electron
// and database imports so the startup tests can load it under vitest.
//
// Nothing outside search and Ask needs the index, so when it is down those two
// report it and everything else carries on.

export const INDEX_UNAVAILABLE = "index-unavailable";

const UNAVAILABLE_MESSAGE =
  "Search isn't available right now. Your entries are safe; restart MindSage to try again.";

export class IndexUnavailableError extends Error {
  constructor(message = UNAVAILABLE_MESSAGE) {
    super(message);
    this.name = "IndexUnavailableError";
    this.code = INDEX_UNAVAILABLE;
  }
}

export const isIndexUnavailable = (error) => error?.code === INDEX_UNAVAILABLE;

// The shape IPC handlers return instead of throwing, matching the existing
// `{ success: false, error }` results so callers can tell this case apart.
export const indexUnavailableResult = () => ({
  success: false,
  code: INDEX_UNAVAILABLE,
  error: UNAVAILABLE_MESSAGE,
});

// ---- Waiting for the first start attempt to finish --------------------------
//
// A search that arrives while Qdrant is still starting should wait for the
// outcome, not be told "unavailable" about a start that is about to succeed.
// `markIndexSettled` is called once the first attempt has ended, either way;
// a later retry that succeeds just makes the client available as before.

export const INDEX_SETTLE_TIMEOUT_MS = 20_000;

let settled = false;
let settle = () => {};
let settledPromise = new Promise((resolve) => (settle = resolve));

export function markIndexSettled() {
  settled = true;
  settle();
}

// Resolves when the first start attempt has ended, or after `timeoutMs`
// (Qdrant's own readiness wait is 15 s, so this only matters if it hangs).
export function indexSettled(timeoutMs = INDEX_SETTLE_TIMEOUT_MS) {
  if (settled) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    settledPromise.then(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

// For tests: forget that the first attempt has ended.
export function resetIndexSettled() {
  settled = false;
  settledPromise = new Promise((resolve) => (settle = resolve));
}
