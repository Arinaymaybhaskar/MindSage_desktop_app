import { describe, expect, it, vi } from "vitest";
import {
  prepareToRestart,
  registerUnsavedWork,
  UNSAVED_REASON,
} from "./unsavedWork";

describe("prepareToRestart", () => {
  it("is fine to restart when nothing is registered", () => {
    expect(prepareToRestart()).toEqual({ ok: true });
  });

  it("flushes every guard before it decides", () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = registerUnsavedWork({ flush: a });
    const offB = registerUnsavedWork({ flush: b });
    expect(prepareToRestart()).toEqual({ ok: true });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    offA();
    offB();
  });

  it("refuses while any guard still has work a restart would lose", () => {
    const off1 = registerUnsavedWork({ isDirty: () => false });
    const off2 = registerUnsavedWork({ isDirty: () => true });
    expect(prepareToRestart()).toEqual({ ok: false, reason: UNSAVED_REASON });
    off1();
    off2();
  });

  it("refuses when a draft could not be written, and when the check throws", () => {
    const off1 = registerUnsavedWork({
      flush: () => {
        throw new Error("quota");
      },
    });
    expect(prepareToRestart().ok).toBe(false);
    off1();
    const off2 = registerUnsavedWork({
      isDirty: () => {
        throw new Error("boom");
      },
    });
    expect(prepareToRestart().ok).toBe(false);
    off2();
  });

  it("forgets a guard once it unregisters (the screen closed)", () => {
    const off = registerUnsavedWork({ isDirty: () => true });
    expect(prepareToRestart().ok).toBe(false);
    off();
    expect(prepareToRestart()).toEqual({ ok: true });
  });
});
