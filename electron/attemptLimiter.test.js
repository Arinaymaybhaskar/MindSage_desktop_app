import { describe, expect, it } from "vitest";
import { createAttemptLimiter } from "./attemptLimiter.js";

const clock = (start = 1_000_000) => {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms) };
};

describe("attempt limiter", () => {
  it("allows attempts and counts down the wrong ones", () => {
    const c = clock();
    const l = createAttemptLimiter({ maxAttempts: 3, now: c.now });
    expect(l.lockedFor("u1")).toBeNull();
    expect(l.fail("u1")).toBe(2);
    expect(l.fail("u1")).toBe(1);
    expect(l.lockedFor("u1")).toBeNull();
  });

  it("locks after the last allowed failure, and says for how long", () => {
    const c = clock();
    const l = createAttemptLimiter({
      maxAttempts: 3,
      lockMs: 30_000,
      now: c.now,
    });
    l.fail("u1");
    l.fail("u1");
    expect(l.fail("u1")).toBe(0);
    expect(l.lockedFor("u1")).toBe(30);
    c.advance(10_500);
    expect(l.lockedFor("u1")).toBe(20);
  });

  it("unlocks with a clean slate once the time is up", () => {
    const c = clock();
    const l = createAttemptLimiter({
      maxAttempts: 2,
      lockMs: 1000,
      now: c.now,
    });
    l.fail("u1");
    l.fail("u1");
    c.advance(1001);
    expect(l.lockedFor("u1")).toBeNull();
    expect(l.fail("u1")).toBe(1); // counting from zero again
  });

  it("a correct password clears the count", () => {
    const l = createAttemptLimiter({ maxAttempts: 3 });
    l.fail("u1");
    l.fail("u1");
    l.succeed("u1");
    expect(l.fail("u1")).toBe(2);
  });

  it("keeps every user's count to themselves", () => {
    const l = createAttemptLimiter({ maxAttempts: 2 });
    l.fail("u1");
    l.fail("u1");
    expect(l.lockedFor("u1")).not.toBeNull();
    expect(l.lockedFor("u2")).toBeNull();
    expect(l.fail("u2")).toBe(1);
  });
});
