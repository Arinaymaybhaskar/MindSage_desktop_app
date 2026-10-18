import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  INDEX_SETTLE_TIMEOUT_MS,
  indexSettled,
  markIndexSettled,
  resetIndexSettled,
} from "./searchIndex.js";

beforeEach(() => {
  vi.useFakeTimers();
  resetIndexSettled();
});
afterEach(() => vi.useRealTimers());

const track = (promise) => {
  const state = { done: false };
  promise.then(() => (state.done = true));
  return state;
};

describe("indexSettled", () => {
  it("waits until the first start attempt has ended", async () => {
    const waiting = track(indexSettled());
    await vi.advanceTimersByTimeAsync(10_000);
    expect(waiting.done).toBe(false);

    markIndexSettled();
    await vi.advanceTimersByTimeAsync(0);
    expect(waiting.done).toBe(true);
  });

  it("releases every caller that was waiting", async () => {
    const all = [track(indexSettled()), track(indexSettled())];
    markIndexSettled();
    await vi.advanceTimersByTimeAsync(0);
    expect(all.map((w) => w.done)).toEqual([true, true]);
  });

  it("resolves at once for a caller that arrives after it ended", async () => {
    markIndexSettled();
    const late = track(indexSettled());
    await vi.advanceTimersByTimeAsync(0);
    expect(late.done).toBe(true);
  });

  it("gives up after the timeout if the start never ends", async () => {
    const waiting = track(indexSettled());
    await vi.advanceTimersByTimeAsync(INDEX_SETTLE_TIMEOUT_MS - 1);
    expect(waiting.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(waiting.done).toBe(true);
  });

  it("honours a shorter timeout", async () => {
    const waiting = track(indexSettled(500));
    await vi.advanceTimersByTimeAsync(500);
    expect(waiting.done).toBe(true);
  });

  it("does not leave a timer behind once released", async () => {
    indexSettled();
    markIndexSettled();
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
