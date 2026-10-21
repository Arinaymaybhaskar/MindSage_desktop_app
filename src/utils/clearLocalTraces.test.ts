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
    localStorage.setItem("draft:1:journal", "unsaved");
    localStorage.setItem(SETUP_COMPLETE_KEY, "1");
    localStorage.setItem("theme", "dark");
  });

  it("with other profiles left, drops the display cache and the deleted profile's drafts", () => {
    localStorage.setItem("draft:2:journal", "other profile");
    clearLocalTraces(false, 1);
    expect(localStorage.getItem("userInfo")).toBeNull();
    expect(localStorage.getItem("draft:1:journal")).toBeNull();
    expect(localStorage.getItem("draft:2:journal")).toBe("other profile");
    expect(localStorage.getItem(SETUP_COMPLETE_KEY)).toBe("1");
  });

  it("for the last profile, also drops drafts and the setup flag", () => {
    clearLocalTraces(true, 1);
    expect(localStorage.getItem("draft:1:journal")).toBeNull();
    expect(localStorage.getItem(SETUP_COMPLETE_KEY)).toBeNull();
    expect(localStorage.getItem("theme")).toBe("dark");
  });
});

describe("clearLocalTraces after the main process wiped localStorage (KAN-376)", () => {
  it("puts back what stays, never the display cache", () => {
    localStorage.clear();
    localStorage.setItem("userInfo", '{"username":"gone"}');
    localStorage.setItem("theme", "dark");
    localStorage.setItem("draft:1:journal", "gone profile's text");
    localStorage.setItem("draft:1:journal-7", "gone profile's edit");
    localStorage.setItem("draft:2:journal", "kept profile's text");
    localStorage.setItem("draft-journal", "old unscoped draft");
    const before = snapshotLocalStorage();
    localStorage.clear(); // what the delete does on disk
    clearLocalTraces(false, 1, before);
    expect(localStorage.getItem("userInfo")).toBeNull();
    expect(localStorage.getItem("theme")).toBe("dark");
    // KAN-380: the deleted profile's drafts are not restored, the other's are.
    expect(Object.keys(localStorage).sort()).toEqual([
      "draft:2:journal",
      "theme",
    ]);
  });

  it("does not overwrite a key written after the wipe", () => {
    localStorage.clear();
    localStorage.setItem("theme", "dark");
    const before = snapshotLocalStorage();
    localStorage.clear();
    localStorage.setItem("theme", "light");
    clearLocalTraces(false, 1, before);
    expect(localStorage.getItem("theme")).toBe("light");
  });

  it("for the last profile, does not put back drafts or the setup flag", () => {
    const before: [string, string][] = [
      ["draft:2:quick-capture", "x"],
      [SETUP_COMPLETE_KEY, "1"],
      ["zoom_scale", "1.1"],
    ];
    localStorage.clear();
    clearLocalTraces(true, 1, before);
    expect(Object.keys(localStorage)).toEqual(["zoom_scale"]);
  });

  it("keepsAfterDelete", () => {
    expect(keepsAfterDelete("userInfo", false)).toBe(false);
    expect(keepsAfterDelete("draft:1:journal", false, 1)).toBe(false);
    expect(keepsAfterDelete("draft:1:journal-4", false, 1)).toBe(false);
    expect(keepsAfterDelete("draft:2:journal", false, 1)).toBe(true);
    expect(keepsAfterDelete("draft:12:journal", false, 1)).toBe(true);
    expect(keepsAfterDelete("draft:2:journal", true, 1)).toBe(false);
    // Deleted profile unknown: no draft is risked.
    expect(keepsAfterDelete("draft:2:journal", false)).toBe(false);
    // Unscoped drafts of older versions never come back.
    expect(keepsAfterDelete("draft-journal", false, 1)).toBe(false);
    expect(keepsAfterDelete("draft-journal-4", false, 1)).toBe(false);
    expect(keepsAfterDelete("colorTheme", true)).toBe(true);
  });
});
