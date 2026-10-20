import { describe, expect, it } from "vitest";
import { checkpointOnce, foldWal } from "./walCheckpoint.js";

// A stand-in for a better-sqlite3 handle: answers busy_timeout and returns
// the next scripted wal_checkpoint row (or throws it, when it is an Error).
function fakeDb(rows) {
  const calls = [];
  let timeout = 5000;
  return {
    calls,
    get timeout() {
      return timeout;
    },
    pragma(statement, options) {
      calls.push(statement);
      if (statement === "busy_timeout" && options?.simple) return timeout;
      const set = /^busy_timeout = (\d+)$/.exec(statement);
      if (set) {
        timeout = Number(set[1]);
        return [];
      }
      if (statement === "wal_checkpoint(TRUNCATE)") {
        const next = rows.shift();
        if (next instanceof Error) throw next;
        return [next];
      }
      throw new Error(`unexpected pragma: ${statement}`);
    },
  };
}

const noSleep = async () => {};

describe("checkpointOnce", () => {
  it("is ok when nothing is left in the WAL, and restores the busy wait", () => {
    const d = fakeDb([{ busy: 0, log: 0, checkpointed: 0 }]);
    expect(checkpointOnce(d, { timeoutMs: 50 })).toEqual({
      ok: true,
      busy: 0,
      log: 0,
      checkpointed: 0,
    });
    expect(d.calls).toContain("busy_timeout = 50");
    expect(d.timeout).toBe(5000);
  });

  it("is not ok when a reader kept it busy", () => {
    const d = fakeDb([{ busy: 1, log: 12, checkpointed: 7 }]);
    expect(checkpointOnce(d).ok).toBe(false);
    expect(d.timeout).toBe(5000);
  });

  it("is not ok, and does not throw, when the connection refuses", () => {
    const d = fakeDb([new Error("database table is locked")]);
    expect(checkpointOnce(d).ok).toBe(false);
    expect(d.timeout).toBe(5000);
  });
});

describe("foldWal", () => {
  it("retries a busy checkpoint until it completes", async () => {
    const d = fakeDb([
      { busy: 1, log: 10, checkpointed: 4 },
      { busy: 1, log: 10, checkpointed: 8 },
      { busy: 0, log: 0, checkpointed: 0 },
    ]);
    expect(await foldWal(d, { sleep: noSleep })).toEqual({
      ok: true,
      attempts: 3,
    });
  });

  it("gives up after the set number of tries and says so", async () => {
    const busy = { busy: 1, log: 10, checkpointed: 4 };
    const d = fakeDb([busy, busy, busy]);
    const waits = [];
    const r = await foldWal(d, {
      attempts: 3,
      waitMs: 20,
      sleep: async (ms) => waits.push(ms),
    });
    expect(r).toEqual({ ok: false, attempts: 3 });
    expect(waits).toEqual([20, 20]);
  });
});
