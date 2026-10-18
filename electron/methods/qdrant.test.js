import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

// qdrant.js and searchIndex.js keep module-level state (the client, whether
// the first start has ended), so each scenario loads a fresh copy of both.
async function fresh() {
  vi.resetModules();
  handlers.clear();
  const q = await import("./qdrant.js");
  const idx = await import("../services/searchIndex.js");
  q.registerQdrantIPC();
  return { ...q, ...idx };
}

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

beforeEach(() => vi.clearAllMocks());

describe("qdrant IPC after the first start failed", () => {
  it("registers every handler without a runtime", async () => {
    const m = await fresh();
    for (const [channel] of CLIENT_CHANNELS)
      expect(handlers.has(channel)).toBe(true);
    expect(handlers.has("qdrant:bulk-sync")).toBe(true);
    expect(m.isIndexReady()).toBe(false);
  });

  it.each(CLIENT_CHANNELS)(
    "%s returns the index-unavailable result instead of throwing",
    async (channel, ...args) => {
      const m = await fresh();
      m.markIndexSettled();
      const result = await call(channel, ...args);
      expect(result).toMatchObject({
        success: false,
        code: m.INDEX_UNAVAILABLE,
      });
      expect(result.error).toMatch(/Search isn't available/);
    },
  );

  it("SemanticSearch throws the error Ask checks for", async () => {
    const m = await fresh();
    m.markIndexSettled();
    await expect(
      m.SemanticSearch([0.1], 7, 5, "mind_entries"),
    ).rejects.toSatisfy(m.isIndexUnavailable);
  });

  it("bulk sync without a worker still answers instead of crashing", async () => {
    const m = await fresh();
    m.markIndexSettled();
    delete global.qdrantWorker;
    await expect(call("qdrant:bulk-sync")).resolves.toMatchObject({
      success: false,
    });
  });
});

describe("qdrant IPC while the first start is still in flight", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("holds a search until the start ends, then serves it", async () => {
    const m = await fresh();
    client.getCollections.mockResolvedValue({ collections: ["mind_entries"] });

    let answer;
    call("qdrant:get-collections").then((r) => (answer = r));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(answer).toBeUndefined();
    expect(client.getCollections).not.toHaveBeenCalled();

    m.setQdrantRuntime({ baseUrl: "http://127.0.0.1:6400" });
    m.markIndexSettled();
    await vi.advanceTimersByTimeAsync(0);
    expect(answer).toEqual({ collections: ["mind_entries"] });
  });

  it("holds a search until the start ends, then says unavailable if it failed", async () => {
    const m = await fresh();

    let answer;
    call("qdrant:search", "mind_entries", "query").then((r) => (answer = r));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(answer).toBeUndefined();

    m.markIndexSettled();
    await vi.advanceTimersByTimeAsync(0);
    expect(answer).toMatchObject({ success: false, code: m.INDEX_UNAVAILABLE });
  });

  it("does not wait forever if the start never ends", async () => {
    const m = await fresh();

    let answer;
    call("qdrant:upsert", "c", []).then((r) => (answer = r));
    await vi.advanceTimersByTimeAsync(m.INDEX_SETTLE_TIMEOUT_MS - 1);
    expect(answer).toBeUndefined();
    await vi.advanceTimersByTimeAsync(2);
    expect(answer).toMatchObject({ success: false, code: m.INDEX_UNAVAILABLE });
  });

  it("serves a call that arrives after a retry brought the index up", async () => {
    const m = await fresh();
    m.markIndexSettled(); // first start failed
    expect(await call("qdrant:get-collections")).toMatchObject({
      code: m.INDEX_UNAVAILABLE,
    });

    m.setQdrantRuntime({ baseUrl: "http://127.0.0.1:6400" }); // retry worked
    client.getCollections.mockResolvedValue({ collections: [] });
    await expect(call("qdrant:get-collections")).resolves.toEqual({
      collections: [],
    });
  });
});

describe("qdrant IPC once the index is running", () => {
  async function running() {
    const m = await fresh();
    m.setQdrantRuntime({ baseUrl: "http://127.0.0.1:6400" });
    m.markIndexSettled();
    return m;
  }

  it("connects the client to the runtime's address", async () => {
    const m = await running();
    expect(QdrantClient).toHaveBeenCalledWith({ url: "http://127.0.0.1:6400" });
    expect(m.isIndexReady()).toBe(true);
  });

  it("searches for the signed-in user only and drops weak matches", async () => {
    await running();
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
    await running();
    client.getCollections.mockResolvedValue({ collections: [] });
    await expect(call("qdrant:get-collections")).resolves.toEqual({
      collections: [],
    });
  });
});
