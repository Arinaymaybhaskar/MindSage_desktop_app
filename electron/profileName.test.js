import { describe, expect, it } from "vitest";
import { cleanProfileName, MAX_PROFILE_NAME } from "./profileName.js";

describe("cleanProfileName", () => {
  it("accepts emoji and non-Latin scripts", () => {
    for (const name of [
      "Maya",
      "माया",
      "マヤ",
      "Мая",
      "مايا",
      "🌙",
      "Maya 🌙",
      "👩🏽‍💻 dev",
      "José",
      "o'brien-2",
    ]) {
      expect(cleanProfileName(name)).toBe(name);
    }
  });

  it("trims, collapses whitespace and normalises to NFC", () => {
    expect(cleanProfileName("  Ma\t ya  ")).toBe("Ma ya");
    expect(cleanProfileName("José")).toBe("José");
  });

  it("refuses empty, too long and symbol names", () => {
    expect(() => cleanProfileName("")).toThrow(/Enter a profile name/);
    expect(() => cleanProfileName("   ")).toThrow(/Enter a profile name/);
    expect(() => cleanProfileName(null)).toThrow(/Enter a profile name/);
    expect(() => cleanProfileName("a".repeat(MAX_PROFILE_NAME + 1))).toThrow(
      /or fewer/,
    );
    expect(cleanProfileName("🌙".repeat(MAX_PROFILE_NAME))).toHaveLength(
      MAX_PROFILE_NAME * 2,
    );
    for (const bad of ["a/b", "<b>", "a@b", "x\u0000y"]) {
      expect(() => cleanProfileName(bad)).toThrow(/can use/);
    }
  });
});
