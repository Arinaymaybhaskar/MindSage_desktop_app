import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// qdrant.js registers on ipcMain and talks to Qdrant through the REST client;
// both are replaced so the handlers can be called directly.
const handlers = new Map();
vi.mock("electron", () => ({
  ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) },
}));

const client = {
  getCollections: vi.fn(),
  createCollection: vi.fn(),
  upsert: vi.fn(),
  search: vi.fn(),
  deleteCollection: vi.fn(),
  setPayload: vi.fn(),
  updateVectors: vi.fn(),
};
const QdrantClient = vi.fn(function () {
  return client;
});
vi.mock("@qdrant/js-client-rest", () => ({ QdrantClient }));

vi.mock("./ollama.js", () => ({
  generateEmbedding: vi.fn(async () => [0.1, 0.2, 0.3]),
}));
vi.mock("../session.js", () => ({ currentUserId: () => 7 }));

const { registerQdrantIPC, setQdrantRuntime, isIndexReady, SemanticSearch } =
  await import("./qdrant.js");
const { INDEX_UNAVAILABLE, isIndexUnavailable } =
  await import("../services/searchIndex.js");

const call = (channel, ...args) => handlers.get(channel)({}, ...args);

// Every handler that needs the Qdrant client, with arguments it accepts.
const CLIENT_CHANNELS = [
  ["qdrant:get-collections"],
  ["qdrant:create-collection", "c", 768],
  ["qdrant:upsert", "c", []],
  ["qdrant:search", "mind_entries", "query"],
  ["qdrant:delete-collection", "c"],
  ["qdrant:update-point", "c", 1, [0.1]],
  ["qdrant:update-payload", "c", 1, {}],
  ["qdrant:update-vector", "c", 1, [0.1]],
];

beforeAll(() => {
  registerQdrantIPC();
});

describe("qdrant IPC before the index is running", () => {
  it("registers every handler without a runtime", () => {
    for (const [channel] of CLIENT_CHANNELS)
      expect(handlers.has(channel)).toBe(true);
    expect(handlers.has("qdrant:bulk-sync")).toBe(true);
    expect(isIndexReady()).toBe(false);
  });

  it.each(CLIENT_CHANNELS)(
    "%s returns the index-unavailable result instead of throwing",
    async (channel, ...args) => {
      const result = await call(channel, ...args);
      expect(result).toMatchObject({ success: false, code: INDEX_UNAVAILABLE });
      expect(result.error).toMatch(/Search isn't available/);
    },
  );

  it("SemanticSearch throws the index-unavailable error Ask checks for", async () => {
    await expect(SemanticSearch([0.1], 7, 5, "mind_entries")).rejects.toSatisfy(
      isIndexUnavailable,
    );
  });

  it("bulk sync without a worker still answers instead of crashing", async () => {
    delete global.qdrantWorker;
    await expect(call("qdrant:bulk-sync")).resolves.toMatchObject({
      success: false,
    });
  });
});

describe("qdrant IPC once the index is running", () => {
  beforeAll(() => {
    setQdrantRuntime({ baseUrl: "http://127.0.0.1:6400" });
  });
  beforeEach(() => vi.clearAllMocks());

  it("connects the client to the runtime's address", () => {
    setQdrantRuntime({ baseUrl: "http://127.0.0.1:6400" });
    expect(QdrantClient).toHaveBeenCalledWith({ url: "http://127.0.0.1:6400" });
    expect(isIndexReady()).toBe(true);
  });

  it("searches for the signed-in user only and drops weak matches", async () => {
    client.search.mockResolvedValue([
      { id: 1, score: 0.9 },
      { id: 2, score: 0.2 },
    ]);
    const results = await call("qdrant:search", "mind_entries", "query", 5);

    expect(results).toEqual([{ id: 1, score: 0.9 }]);
    const [collection, body] = client.search.mock.calls[0];
    expect(collection).toBe("mind_entries");
    expect(body.limit).toBe(5);
    expect(body.filter).toEqual({
      must: [{ key: "user_id", match: { value: 7 } }],
    });
  });

  it("passes calls through to the client", async () => {
    client.getCollections.mockResolvedValue({ collections: [] });
    await expect(call("qdrant:get-collections")).resolves.toEqual({
      collections: [],
    });
  });
});
