import { beforeEach, describe, expect, it } from "vitest";
import { clearLocalTraces } from "./clearLocalTraces";
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
