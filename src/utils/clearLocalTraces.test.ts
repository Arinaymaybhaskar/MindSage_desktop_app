import { beforeEach, describe, expect, it } from "vitest";
import {
  clearLocalTraces,
  keepsAfterDelete,
  snapshotLocalStorage,
} from "./clearLocalTraces";
import { SETUP_COMPLETE_KEY } from "../pages/Onboarding";

describe("clearLocalTraces", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("userInfo", "{}");
    localStorage.setItem("draft-journal", "unsaved");
    localStorage.setItem(SETUP_COMPLETE_KEY, "1");
    localStorage.setItem("theme", "dark");
  });

  it("with other profiles left, drops only the display cache", () => {
    clearLocalTraces(false);
    expect(localStorage.getItem("userInfo")).toBeNull();
    expect(localStorage.getItem("draft-journal")).toBe("unsaved");
    expect(localStorage.getItem(SETUP_COMPLETE_KEY)).toBe("1");
  });

  it("for the last profile, also drops drafts and the setup flag", () => {
    clearLocalTraces(true);
    expect(localStorage.getItem("draft-journal")).toBeNull();
    expect(localStorage.getItem(SETUP_COMPLETE_KEY)).toBeNull();
    expect(localStorage.getItem("theme")).toBe("dark");
  });
});

describe("clearLocalTraces after the main process wiped localStorage (KAN-376)", () => {
  it("puts back what stays, never the display cache", () => {
    localStorage.clear();
    localStorage.setItem("userInfo", '{"username":"gone"}');
    localStorage.setItem("theme", "dark");
    localStorage.setItem("draft-journal", "unsaved");
    const before = snapshotLocalStorage();
    localStorage.clear(); // what the delete does on disk
    clearLocalTraces(false, before);
    expect(localStorage.getItem("userInfo")).toBeNull();
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(localStorage.getItem("draft-journal")).toBe("unsaved");
  });

  it("does not overwrite a key written after the wipe", () => {
    localStorage.clear();
    localStorage.setItem("theme", "dark");
    const before = snapshotLocalStorage();
    localStorage.clear();
    localStorage.setItem("theme", "light");
    clearLocalTraces(false, before);
    expect(localStorage.getItem("theme")).toBe("light");
  });

  it("for the last profile, does not put back drafts or the setup flag", () => {
    const before: [string, string][] = [
      ["draft-quick-capture", "x"],
      [SETUP_COMPLETE_KEY, "1"],
      ["zoom_scale", "1.1"],
    ];
    localStorage.clear();
    clearLocalTraces(true, before);
    expect(Object.keys(localStorage)).toEqual(["zoom_scale"]);
  });

  it("keepsAfterDelete", () => {
    expect(keepsAfterDelete("userInfo", false)).toBe(false);
    expect(keepsAfterDelete("draft-journal-4", false)).toBe(true);
    expect(keepsAfterDelete("draft-journal-4", true)).toBe(false);
    expect(keepsAfterDelete("colorTheme", true)).toBe(true);
  });
});
