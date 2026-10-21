import { describe, it, expect, vi, afterEach } from "vitest";

// The `ollama:models` handler as IPC calls it (KAN-369). ollama.js reaches
// electron-store, the database and the search module; those are replaced so
// the handler runs here. `execSync` is a trap: the handler used to run
// `ollama list` through it, which blocks the main process.
const execSync = vi.fn(() => {
  throw new Error("execSync blocks the main process");
});
vi.mock("child_process", () => {
  const cp = { execSync, exec: vi.fn(), spawn: vi.fn() };
  return { ...cp, default: cp };
});
vi.mock("../store.js", () => ({ modelStore: { get: vi.fn() } }));
vi.mock("./search.js", () => ({ semanticSearch: vi.fn() }));
vi.mock("../db/connection.js", () => ({ db: {} }));
vi.mock("../db/index.js", () => ({ default: {} }));
vi.mock("../session.js", () => ({ currentUserId: () => 7 }));
vi.mock("../log.js", () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { handleGetOllamaModels } = await import("./ollama.js");
const { LIST_TIMEOUT_MS } = await import("./ollamaList.js");

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.useRealTimers();
});

describe("handleGetOllamaModels", () => {
  it("answers the not-responding error within the timeout when Ollama hangs", async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn(
      (_url, { signal } = {}) =>
        new Promise((_, reject) =>
          signal?.addEventListener("abort", () => reject(signal.reason)),
        ),
    );

    const pending = handleGetOllamaModels();
    await vi.advanceTimersByTimeAsync(LIST_TIMEOUT_MS);

    await expect(pending).resolves.toEqual({
      error: "Ollama is not responding.",
      reason: "timeout",
    });
    expect(execSync).not.toHaveBeenCalled();
  });

  it("lists models over the HTTP API without spawning the CLI", async () => {
    globalThis.fetch = vi.fn(async (url) => ({
      ok: true,
      json: async () =>
        url.endsWith("/api/tags")
          ? { models: [{ name: "m:1", size: 1500000000, digest: "abc" }] }
          : { capabilities: ["completion"] },
    }));

    await expect(handleGetOllamaModels()).resolves.toEqual([
      {
        name: "m:1",
        size: "abc",
        modified: "1.5 GB",
        info: { capabilities: ["completion"] },
      },
    ]);
    expect(execSync).not.toHaveBeenCalled();
  });
});
