import { describe, it, expect, vi, beforeEach } from "vitest";

const handlers = new Map();
vi.mock("electron", () => ({
  ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) },
}));
vi.mock("./ollama.js", () => ({ generateEmbedding: vi.fn() }));
vi.mock("../session.js", () => ({ currentUserId: () => 7 }));
vi.mock("../log.js", () => ({ log: { error: vi.fn(), info: vi.fn() } }));

const available = { value: false };
vi.mock("../db/searchIndex.js", () => ({
  SOURCE_TYPES: ["journal"],
  vectorsAvailable: () => available.value,
  retryGaveUp: (...a) => retryGaveUp(...a),
}));
const retryGaveUp = vi.fn(() => 0);

const { registerSearchIPC, setIndexer } = await import("./search.js");
const { indexUnavailableResult } = await import("../services/searchIndex.js");
registerSearchIPC();

describe("search:sync", () => {
  const noteChanged = vi.fn();
  beforeEach(() => {
    noteChanged.mockClear();
    setIndexer({ noteChanged });
  });

  it("reports the index as unavailable instead of queueing", async () => {
    available.value = false;
    const result = await handlers.get("search:sync")({}, "journal", 1);
    expect(result).toEqual(indexUnavailableResult());
    expect(noteChanged).not.toHaveBeenCalled();
  });

  it("queues the item when the index is available", async () => {
    available.value = true;
    const result = await handlers.get("search:sync")({}, "journal", 1);
    expect(result.success).toBe(true);
    expect(noteChanged).toHaveBeenCalledWith("journal", 1);
  });
});

describe("search:bulk-sync (KAN-373)", () => {
  const sweep = vi.fn();
  beforeEach(() => {
    sweep.mockClear();
    retryGaveUp.mockClear();
    setIndexer({ sweep });
  });

  it("resets rows that gave up before it sweeps", async () => {
    available.value = true;
    const order = [];
    retryGaveUp.mockImplementationOnce(() => (order.push("reset"), 2));
    sweep.mockImplementationOnce(() => order.push("sweep"));
    const result = await handlers.get("search:bulk-sync")({});
    expect(result.success).toBe(true);
    expect(order).toEqual(["reset", "sweep"]);
  });

  it("does nothing while the index is unavailable", async () => {
    available.value = false;
    const result = await handlers.get("search:bulk-sync")({});
    expect(result).toEqual(indexUnavailableResult());
    expect(retryGaveUp).not.toHaveBeenCalled();
    expect(sweep).not.toHaveBeenCalled();
  });
});
