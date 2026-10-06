import { describe, it, expect, beforeEach, vi } from "vitest";
import journalService from "./journalService.tsx";

// journalService delegates every call to
// window.electron.ipcRenderer.invoke(channel, ...args). These tests assert the
// channel names and argument order the main process depends on, and that no
// credential travels with them: the session lives in the main process.
const invoke = vi.fn();

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue({ ok: true });
  // @ts-expect-error minimal stub of the preload bridge for tests
  globalThis.window = { electron: { ipcRenderer: { invoke } } };
});

describe("journalService", () => {
  it("getOne routes to journal:get-by-id with the id alone", async () => {
    await journalService.getOne(42);
    expect(invoke).toHaveBeenCalledWith("journal:get-by-id", 42);
  });

  it("update routes to journal:update with the payload", async () => {
    const payload = { title: "t", content: "c" };
    await journalService.update(7, payload);
    expect(invoke).toHaveBeenCalledWith("journal:update", 7, payload);
  });

  it("retryAIMetadata routes to journal:retry-ai-metadata", async () => {
    await journalService.retryAIMetadata(5, "summary");
    expect(invoke).toHaveBeenCalledWith(
      "journal:retry-ai-metadata",
      5,
      "summary",
    );
  });

  it("throws when not running in an Electron environment", async () => {
    // @ts-expect-error intentionally clear the bridge
    globalThis.window = {};
    await expect(journalService.getOne(1)).rejects.toThrow(/Electron/);
  });
});
