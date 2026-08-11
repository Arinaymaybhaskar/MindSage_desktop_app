import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { formatTimeAgo } from "./DateFormatter.ts";

describe("formatTimeAgo", () => {
  // Pin "now" so relative output is deterministic.
  const now = new Date("2026-08-11T12:00:00");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports 'just now' for very recent times", () => {
    const fiveSecondsAgo = new Date(now.getTime() - 5 * 1000).toISOString();
    expect(formatTimeAgo(fiveSecondsAgo)).toBe("just now");
  });

  it("reports seconds for the sub-minute range", () => {
    const thirtySecondsAgo = new Date(now.getTime() - 30 * 1000).toISOString();
    expect(formatTimeAgo(thirtySecondsAgo)).toBe("30 seconds ago");
  });

  it("reports hours and minutes within a day", () => {
    const twoHrsTenMin = new Date(
      now.getTime() - (2 * 60 + 10) * 60 * 1000,
    ).toISOString();
    expect(formatTimeAgo(twoHrsTenMin)).toBe("2h10m ago");
  });

  it("reports 'yesterday' for the previous day", () => {
    const yesterday = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString();
    expect(formatTimeAgo(yesterday)).toMatch(/^yesterday at /);
  });
});
