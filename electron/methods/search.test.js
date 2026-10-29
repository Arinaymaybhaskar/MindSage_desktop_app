import { describe, it, expect, vi, beforeEach } from "vitest";

const handlers = new Map();
vi.mock("electron", () => ({
  ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) },
}));
const embed = vi.fn();
vi.mock("../ai/client.js", () => ({ embed }));
vi.mock("../session.js", () => ({ currentUserId: () => 7 }));
vi.mock("../log.js", () => ({ log: { error: vi.fn(), info: vi.fn() } }));

const available = { value: false };
const searchSimilar = vi.fn(() => [{ id: 1 }]);
vi.mock("../db/searchIndex.js", () => ({
  SOURCE_TYPES: ["journal"],
  vectorsAvailable: () => available.value,
  searchSimilar,
}));

const { registerSearchIPC, setIndexer } = await import("./search.js");
const { indexUnavailableResult } = await import("../services/searchIndex.js");
registerSearchIPC();

describe("search:query (KAN-439)", () => {
  beforeEach(() => {
    available.value = true;
    embed.mockReset();
    searchSimilar.mockClear();
  });

  it("embeds a shorter start of a query too long for the model", async () => {
    const sent = [];
    embed.mockImplementation(async (text) => {
      sent.push(text.length);
      if (text.length > 3_000) {
        throw new Error(
          "Ollama embedding API error: 500 Internal Server Error",
        );
      }
      return [0.1];
    });
    const result = await handlers.get("search:query")(
      {},
      "word ".repeat(10_000),
    );
    expect(sent).toEqual([8_000, 4_000, 2_000]);
    expect(result).toEqual([{ id: 1 }]);
  });

  it("answers a blank query with no results and no embedding", async () => {
    const result = await handlers.get("search:query")({}, "  \n ");
    expect(result).toEqual([]);
    expect(embed).not.toHaveBeenCalled();
    expect(searchSimilar).not.toHaveBeenCalled();
  });
});

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
