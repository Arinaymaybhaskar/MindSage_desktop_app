import { describe, it, expect, vi, beforeEach } from "vitest";

const handlers = new Map();
vi.mock("electron", () => ({
  ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) },
  app: { getPath: () => "/tmp/none" },
}));
const restoreItems = vi.fn();
vi.mock("../db/index.js", () => ({ default: { restoreItems } }));
vi.mock("../session.js", () => ({ currentUserId: () => 7 }));
vi.mock("./media.js", () => ({ thumbnailDir: () => "/tmp/none/thumbs" }));
vi.mock("./ollama.js", () => ({ generateEmbedding: vi.fn() }));
vi.mock("../db/searchIndex.js", () => ({
  SOURCE_TYPES: ["journal"],
  vectorsAvailable: () => true,
}));
vi.mock("../log.js", () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const { registerTrashIPC } = await import("./trash.js");
const { setIndexer } = await import("./search.js");
registerTrashIPC(() => null);

describe("trash:restore (KAN-372)", () => {
  const sweep = vi.fn();
  beforeEach(() => {
    sweep.mockClear();
    restoreItems.mockReset();
    setIndexer({ sweep });
  });

  it("wakes the indexer once after items are restored", async () => {
    restoreItems.mockReturnValue({ entries: 2, goals: 1 });
    const result = await handlers.get("trash:restore")(
      {},
      { entryIds: [1, 2], goalIds: [3] },
    );
    expect(result).toEqual({ entries: 2, goals: 1 });
    expect(sweep).toHaveBeenCalledTimes(1);
  });

  it("does not wake it when nothing was restored", async () => {
    restoreItems.mockReturnValue({ entries: 0, goals: 0 });
    await handlers.get("trash:restore")({}, { entryIds: [9] });
    expect(sweep).not.toHaveBeenCalled();
  });

  it("restores without throwing when there is no indexer", async () => {
    setIndexer(null);
    restoreItems.mockReturnValue({ entries: 1, goals: 0 });
    expect(handlers.get("trash:restore")({}, { entryIds: [1] })).toEqual({
      entries: 1,
      goals: 0,
    });
  });
});
