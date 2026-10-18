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
  delete: vi.fn(),
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

// The database half of the trash: which results are live, and the queue of
// index points waiting to be deleted. Both are tested against real SQLite in
// trash.db.test.js; here they are stand-ins.
const localDB = {
  filterLiveResults: vi.fn((_userId, results) => results),
  pendingVectorDeletions: vi.fn(() => []),
  clearVectorDeletions: vi.fn(),
};
vi.mock("../db/index.js", () => ({ default: localDB }));

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

beforeEach(() => {
  vi.clearAllMocks();
  localDB.filterLiveResults.mockImplementation((_u, results) => results);
  localDB.pendingVectorDeletions.mockReturnValue([]);
});

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

describe("worker-backed sync handlers while the first start is in flight", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    global.qdrantWorker = { postMessage: vi.fn() };
  });
  afterEach(() => {
    vi.useRealTimers();
    delete global.qdrantWorker;
  });

  // Quick Capture can save an entry in the gap before Qdrant is up and asks
  // for it to be indexed; the worker only exists once the start succeeds.
  it("queues the sync once the start has ended instead of refusing", async () => {
    const m = await fresh();
    delete global.qdrantWorker; // not created yet

    let answer;
    call("qdrant:sync-journal", 42).then((r) => (answer = r));
    await vi.advanceTimersByTimeAsync(3_000);
    expect(answer).toBeUndefined();

    // The start succeeds: the worker is created, then the start is marked over.
    global.qdrantWorker = { postMessage: vi.fn() };
    m.markIndexSettled();
    await vi.advanceTimersByTimeAsync(0);

    expect(answer).toMatchObject({ success: true });
    expect(global.qdrantWorker.postMessage).toHaveBeenCalledWith({
      type: "journal:sync-requested",
      data: { journalId: 42 },
    });
  });

  it.each([
    ["qdrant:sync-journal", 1],
    ["qdrant:sync-goal", 1],
    ["qdrant:sync-progress-log", 1],
    ["qdrant:bulk-sync"],
  ])(
    "%s answers 'Worker not available' once the start failed",
    async (channel, ...args) => {
      const m = await fresh();
      delete global.qdrantWorker;

      let answer;
      call(channel, ...args).then((r) => (answer = r));
      await vi.advanceTimersByTimeAsync(3_000);
      expect(answer).toBeUndefined();

      m.markIndexSettled();
      await vi.advanceTimersByTimeAsync(0);
      expect(answer).toMatchObject({
        success: false,
        error: "Worker not available",
      });
    },
  );
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
    // Asks for twice as many, so dropping trashed items does not leave Ask short.
    expect(body.limit).toBe(10);
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

describe("search and the trash", () => {
  async function running() {
    const m = await fresh();
    m.setQdrantRuntime({ baseUrl: "http://127.0.0.1:6400" });
    m.markIndexSettled();
    return m;
  }

  it("returns only results the database says are live, for the signed-in user", async () => {
    await running();
    client.search.mockResolvedValue([
      {
        id: "a",
        score: 0.9,
        payload: { source_type: "journal", source_id: 1 },
      },
      {
        id: "b",
        score: 0.8,
        payload: { source_type: "journal", source_id: 2 },
      },
    ]);
    localDB.filterLiveResults.mockImplementation((_u, results) =>
      results.filter((r) => r.payload.source_id === 1),
    );
    const results = await call("qdrant:search", "mind_entries", "query", 5);
    expect(results.map((r) => r.id)).toEqual(["a"]);
    expect(localDB.filterLiveResults).toHaveBeenCalledWith(
      7,
      expect.any(Array),
    );
  });

  it("never returns more than was asked for, whatever survives the filter", async () => {
    await running();
    client.search.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({
        id: String(i),
        score: 0.9,
        payload: { source_type: "journal", source_id: i },
      })),
    );
    const results = await call("qdrant:search", "mind_entries", "query", 3);
    expect(results).toHaveLength(3);
  });
});

describe("removing deleted items from the index", () => {
  async function running() {
    const m = await fresh();
    m.setQdrantRuntime({ baseUrl: "http://127.0.0.1:6400" });
    return m;
  }
  const row = (id, source_id, source_type = "journal", user_id = 7) => ({
    id,
    user_id,
    source_type,
    source_id,
  });

  it("deletes the queued points by user, kind and id, and clears them", async () => {
    const m = await running();
    localDB.pendingVectorDeletions
      .mockReturnValueOnce([row(1, 11), row(2, 12), row(3, 5, "goal")])
      .mockReturnValue([]);
    client.delete.mockResolvedValue({});
    await expect(m.processVectorDeletions()).resolves.toEqual({
      removed: 3,
      pending: 0,
    });
    expect(client.delete).toHaveBeenCalledTimes(2);
    const [collection, body] = client.delete.mock.calls[0];
    expect(collection).toBe("mind_entries");
    expect(body.filter.must).toEqual([
      { key: "user_id", match: { value: 7 } },
      { key: "source_type", match: { value: "journal" } },
      { key: "source_id", match: { any: [11, 12] } },
    ]);
    expect(localDB.clearVectorDeletions).toHaveBeenCalledWith([1, 2]);
    expect(localDB.clearVectorDeletions).toHaveBeenCalledWith([3]);
  });

  it("keeps the queue when the index is down, so it is retried later", async () => {
    const m = await fresh(); // no runtime
    localDB.pendingVectorDeletions.mockReturnValue([row(1, 11)]);
    await expect(m.processVectorDeletions()).resolves.toEqual({
      removed: 0,
      pending: 1,
    });
    expect(client.delete).not.toHaveBeenCalled();
    expect(localDB.clearVectorDeletions).not.toHaveBeenCalled();
  });

  it("keeps what failed and does not throw", async () => {
    const m = await running();
    localDB.pendingVectorDeletions.mockReturnValue([row(1, 11)]);
    client.delete.mockRejectedValue(new Error("qdrant went away"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await m.processVectorDeletions();
    spy.mockRestore();
    expect(result).toEqual({ removed: 0, pending: 1 });
    expect(localDB.clearVectorDeletions).not.toHaveBeenCalled();
  });

  it("overlapping calls share one run instead of deleting twice", async () => {
    const m = await running();
    localDB.pendingVectorDeletions
      .mockReturnValueOnce([row(1, 11)])
      .mockReturnValue([]);
    client.delete.mockResolvedValue({});
    const [a, b] = await Promise.all([
      m.processVectorDeletions(),
      m.processVectorDeletions(),
    ]);
    expect(client.delete).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });
});
