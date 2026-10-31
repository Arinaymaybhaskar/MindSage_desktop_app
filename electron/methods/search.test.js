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
const hit = (id, source_id) => ({
  id,
  payload: { source_type: "journal", source_id },
});
const searchSimilar = vi.fn(() => [hit(1, 10)]);
const keywordSearch = vi.fn(() => [hit(2, 20)]);
vi.mock("../db/searchIndex.js", () => ({
  SOURCE_TYPES: ["journal"],
  vectorsAvailable: () => available.value,
  searchSimilar,
  keywordSearch,
}));

const { registerSearchIPC, setIndexer } = await import("./search.js");
const { indexUnavailableResult } = await import("../services/searchIndex.js");
registerSearchIPC();

describe("search:query (KAN-439)", () => {
  beforeEach(() => {
    available.value = true;
    embed.mockReset();
    searchSimilar.mockClear();
    keywordSearch.mockClear();
  });

  it("returns the entries holding the words when the query cannot be embedded (KAN-490)", async () => {
    embed.mockRejectedValue(
      Object.assign(new Error("nomic is not downloaded"), {
        code: "AI_UNAVAILABLE",
      }),
    );
    const result = await handlers.get("search:query")({}, "harbour", 5);
    expect(result).toEqual({
      success: false,
      error: "nomic is not downloaded",
      results: [hit(2, 20)],
    });
    expect(keywordSearch).toHaveBeenCalledWith(7, "harbour", 5);
  });

  it("adds exact-word hits the index has not caught up with, without doubles (KAN-499)", async () => {
    embed.mockResolvedValue([0.1]);
    keywordSearch.mockReturnValueOnce([hit(2, 10), hit(3, 30)]);
    const result = await handlers.get("search:query")({}, "garden", 5);
    expect(result).toEqual([hit(2, 10), hit(3, 30)]);
  });

  it("keeps an unindexed exact match when semantic hits fill the limit (KAN-502)", async () => {
    embed.mockResolvedValue([0.1]);
    searchSimilar.mockReturnValueOnce(
      Array.from({ length: 8 }, (_, i) => hit(i, i + 100)),
    );
    keywordSearch.mockReturnValueOnce([hit(99, 999)]);
    const result = await handlers.get("search:query")({}, "garden", 8);
    expect(result).toHaveLength(8);
    expect(result[0]).toEqual(hit(99, 999));
  });

  it("returns exact-word hits when the vector store is unavailable (KAN-499)", async () => {
    available.value = false;
    const result = await handlers.get("search:query")({}, "garden", 5);
    expect(result).toEqual({
      ...indexUnavailableResult(),
      results: [hit(2, 20)],
    });
    expect(embed).not.toHaveBeenCalled();
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
    expect(result).toEqual([hit(2, 20), hit(1, 10)]);
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
