import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// startQdrant spawns the Qdrant binary and polls it over HTTP. The spawn, the
// port picker, the REST client and fetch are replaced so each way Qdrant can
// fail to start is reproducible without a binary.
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "ms-qdrant-test-"));
vi.mock("electron", () => ({
  app: {
    getPath: () => userData,
    getAppPath: () => userData,
    isPackaged: false,
  },
}));

let lastProc = null;
const spawn = vi.fn(() => {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn();
  lastProc = proc;
  return proc;
});
vi.mock("node:child_process", () => ({ spawn, default: { spawn } }));

let nextPort = 6400;
vi.mock("get-port", () => ({ default: vi.fn(async () => nextPort++) }));

const client = {
  getCollection: vi.fn(async () => ({
    config: { params: { vectors: { text_embedding: { size: 768 } } } },
  })),
  createCollection: vi.fn(),
  deleteCollection: vi.fn(),
  createPayloadIndex: vi.fn(),
};
vi.mock("@qdrant/js-client-rest", () => ({
  QdrantClient: vi.fn(function () {
    return client;
  }),
}));

const { startQdrant, stopQdrant } = await import("./qdrantManager.js");

// startQdrant picks a free port before it spawns, so let it get that far
// before the test plays the process's part.
const spawned = async () => {
  await vi.advanceTimersByTimeAsync(0);
  return lastProc;
};

const notReady = () => Promise.reject(new Error("ECONNREFUSED"));
const ready = () => Promise.resolve({ ok: true });

beforeEach(() => {
  vi.useFakeTimers();
  stopQdrant();
  spawn.mockClear();
  delete process.env.QDRANT_HTTP_PORT;
  vi.stubGlobal("fetch", vi.fn(notReady));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("startQdrant", () => {
  it("resolves the runtime once Qdrant answers, and records its port", async () => {
    fetch.mockImplementation(ready);
    const runtime = await startQdrant();

    expect(runtime.baseUrl).toBe(`http://127.0.0.1:${runtime.httpPort}`);
    expect(process.env.QDRANT_HTTP_PORT).toBe(String(runtime.httpPort));
    expect(runtime.dataDir).toBe(path.join(userData, "qdrant-data"));
  });

  it("fails at once, without an uncaught exception, when the binary cannot be spawned", async () => {
    const starting = startQdrant();
    await spawned();
    const enoent = Object.assign(new Error("spawn qdrant ENOENT"), {
      code: "ENOENT",
    });
    lastProc.emit("error", enoent);
    const result = expect(starting).rejects.toBe(enoent);
    await vi.advanceTimersByTimeAsync(300);
    await result;
  });

  it("fails at once when Qdrant exits before it is ready", async () => {
    const starting = startQdrant();
    await spawned();
    lastProc.emit("close", 1);
    const result = expect(starting).rejects.toThrow(
      /exited with code 1 before it was ready/,
    );
    await vi.advanceTimersByTimeAsync(300);
    await result;
  });

  it("spawns a fresh process on the next start after a failed spawn", async () => {
    const first = startQdrant();
    await spawned();
    lastProc.emit("error", new Error("spawn qdrant EACCES"));
    const failed = expect(first).rejects.toThrow(/EACCES/);
    await vi.advanceTimersByTimeAsync(300);
    await failed;

    fetch.mockImplementation(ready);
    await startQdrant();
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  it("lets a retry pick up a Qdrant that was only slow to start", async () => {
    // First start: the process runs but never answers within 15 s.
    const first = startQdrant();
    const timedOut = expect(first).rejects.toThrow(/did not become ready/);
    await vi.advanceTimersByTimeAsync(16_000);
    await timedOut;
    const port = Number(process.env.QDRANT_HTTP_PORT);
    expect(port).toBeGreaterThan(0);

    // It comes up later; the retry reuses that process and its port.
    fetch.mockImplementation(ready);
    const runtime = await startQdrant();
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(runtime.httpPort).toBe(port);
    expect(fetch).toHaveBeenLastCalledWith(
      `http://127.0.0.1:${port}/collections`,
    );
  });
});
