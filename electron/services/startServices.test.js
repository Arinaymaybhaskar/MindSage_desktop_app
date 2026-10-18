import { describe, it, expect, vi } from "vitest";
import { startServices } from "./startServices.js";
import {
  IndexUnavailableError,
  indexUnavailableResult,
  isIndexUnavailable,
  INDEX_UNAVAILABLE,
} from "./searchIndex.js";

// What Qdrant's startup failure looked like on 6 Oct: the data directory sat
// under a path longer than Windows' 260-character MAX_PATH.
const longPathError = () => {
  const dir =
    "C:\\Users\\someone\\AppData\\Roaming\\MindSage\\" + "x".repeat(240);
  const err = new Error(
    `ENAMETOOLONG: name too long, mkdir '${dir}\\qdrant-data'`,
  );
  err.code = "ENAMETOOLONG";
  return err;
};

const deps = (overrides = {}) => ({
  registerHandlers: vi.fn(),
  startIndex: vi.fn().mockResolvedValue({ baseUrl: "http://127.0.0.1:6333" }),
  onIndexReady: vi.fn(),
  onStatus: vi.fn(),
  wait: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe("startServices", () => {
  it("registers handlers, wires the index and reports ready when the index starts", async () => {
    const d = deps();
    const result = await startServices(d);

    expect(d.registerHandlers).toHaveBeenCalledTimes(1);
    expect(d.onIndexReady).toHaveBeenCalledWith({
      baseUrl: "http://127.0.0.1:6333",
    });
    expect(d.onStatus).toHaveBeenCalledTimes(1);
    expect(d.onStatus).toHaveBeenCalledWith({ degraded: false, search: true });
    expect(result.degraded).toBe(false);
    await expect(result.retry).resolves.toBe(true);
    expect(d.wait).not.toHaveBeenCalled();
  });

  // main.js starts this before it creates the window and relies on handlers
  // existing by the time the call returns, without awaiting it.
  it("registers handlers synchronously, before the first await", () => {
    const d = deps({ startIndex: vi.fn(() => new Promise(() => {})) });
    startServices(d);
    expect(d.registerHandlers).toHaveBeenCalledTimes(1);
    expect(d.startIndex).toHaveBeenCalledTimes(1);
  });

  it("registers handlers before the index starts, so they never wait on it", async () => {
    const order = [];
    const d = deps({
      registerHandlers: vi.fn(() => order.push("handlers")),
      startIndex: vi.fn(async () => {
        order.push("index");
        return {};
      }),
    });
    await startServices(d);
    expect(order).toEqual(["handlers", "index"]);
  });

  it("still registers handlers and reports a degraded start when the index fails on a long path", async () => {
    const d = deps({ startIndex: vi.fn().mockRejectedValue(longPathError()) });
    const log = vi.fn();
    const result = await startServices({ ...d, log, retryDelaysMs: [] });

    expect(d.registerHandlers).toHaveBeenCalledTimes(1);
    expect(d.onIndexReady).not.toHaveBeenCalled();
    expect(d.onStatus).toHaveBeenCalledWith({ degraded: true, search: false });
    expect(result).toMatchObject({ degraded: true, search: false });
    await expect(result.retry).resolves.toBe(false);
    expect(log.mock.calls.join("\n")).toMatch(/ENAMETOOLONG/);
  });

  it("brings search back without a restart when a retry succeeds", async () => {
    const startIndex = vi
      .fn()
      .mockRejectedValueOnce(new Error("port in use"))
      .mockRejectedValueOnce(new Error("still starting"))
      .mockResolvedValue({ baseUrl: "http://127.0.0.1:6400" });
    const d = deps({ startIndex });
    const result = await startServices({ ...d, retryDelaysMs: [5, 5, 5] });

    await expect(result.retry).resolves.toBe(true);
    expect(startIndex).toHaveBeenCalledTimes(3);
    expect(d.wait).toHaveBeenCalledTimes(2);
    expect(d.onIndexReady).toHaveBeenCalledWith({
      baseUrl: "http://127.0.0.1:6400",
    });
    expect(d.onStatus.mock.calls.map((c) => c[0])).toEqual([
      { degraded: true, search: false },
      { degraded: false, search: true },
    ]);
  });

  it("gives up after the last retry and stays degraded", async () => {
    const d = deps({
      startIndex: vi.fn().mockRejectedValue(new Error("no binary")),
    });
    const result = await startServices({ ...d, retryDelaysMs: [1, 1] });

    await expect(result.retry).resolves.toBe(false);
    expect(d.startIndex).toHaveBeenCalledTimes(3);
    expect(d.onStatus).toHaveBeenCalledTimes(1);
  });

  it("does not let a handler registration error stop the index from starting", async () => {
    const d = deps({
      registerHandlers: vi.fn(() => {
        throw new Error("duplicate handler");
      }),
    });
    const log = vi.fn();
    const result = await startServices({ ...d, log });
    expect(result.search).toBe(true);
    expect(log.mock.calls.join("\n")).toMatch(/duplicate handler/);
  });
});

describe("catching up after a late index", () => {
  it("runs the catch-up once when a retry brings the index up", async () => {
    const onCatchUp = vi.fn();
    const d = deps({
      startIndex: vi
        .fn()
        .mockRejectedValueOnce(new Error("down"))
        .mockResolvedValue({ baseUrl: "http://127.0.0.1:6333" }),
      onCatchUp,
    });
    const result = await startServices({ ...d, retryDelaysMs: [1, 1] });
    expect(onCatchUp).not.toHaveBeenCalled(); // not before it is up
    await expect(result.retry).resolves.toBe(true);
    expect(onCatchUp).toHaveBeenCalledTimes(1);
  });

  it("does not run it on a normal start (no full re-index)", async () => {
    const onCatchUp = vi.fn();
    const result = await startServices(deps({ onCatchUp }));
    await result.retry;
    expect(onCatchUp).not.toHaveBeenCalled();
  });

  it("does not run it when every retry fails", async () => {
    const onCatchUp = vi.fn();
    const d = deps({
      startIndex: vi.fn().mockRejectedValue(new Error("down")),
      onCatchUp,
    });
    const result = await startServices({ ...d, retryDelaysMs: [1, 1] });
    await expect(result.retry).resolves.toBe(false);
    expect(onCatchUp).not.toHaveBeenCalled();
  });

  it("a catch-up that throws does not undo the recovery", async () => {
    const d = deps({
      startIndex: vi
        .fn()
        .mockRejectedValueOnce(new Error("down"))
        .mockResolvedValue({}),
      onCatchUp: vi.fn(() => {
        throw new Error("no worker");
      }),
    });
    const result = await startServices({ ...d, retryDelaysMs: [1] });
    await expect(result.retry).resolves.toBe(true);
    expect(d.onStatus).toHaveBeenLastCalledWith({
      degraded: false,
      search: true,
    });
  });
});

describe("searchIndex", () => {
  it("marks the unavailable error and result with one code callers can check", () => {
    const err = new IndexUnavailableError();
    expect(isIndexUnavailable(err)).toBe(true);
    expect(isIndexUnavailable(new Error("other"))).toBe(false);
    expect(isIndexUnavailable(undefined)).toBe(false);
    expect(indexUnavailableResult()).toMatchObject({
      success: false,
      code: INDEX_UNAVAILABLE,
    });
    expect(indexUnavailableResult().error).toBe(err.message);
  });
});
