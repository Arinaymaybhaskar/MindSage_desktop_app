// How search reports that the vector index cannot be used (the sqlite-vec
// extension did not load). Kept free of electron and database imports so tests
// can load it under vitest.
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
