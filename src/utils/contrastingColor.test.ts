import { describe, it, expect } from "vitest";
import { getContrastingTextColor } from "./contrastingColor.ts";

describe("getContrastingTextColor", () => {
  it("returns dark text on a light background", () => {
    expect(getContrastingTextColor("#FFFFFF")).toBe("#1F2937");
    expect(getContrastingTextColor("#FFFF00")).toBe("#1F2937"); // bright yellow
  });

  it("returns white text on a dark background", () => {
    expect(getContrastingTextColor("#000000")).toBe("#FFFFFF");
    expect(getContrastingTextColor("#1F2937")).toBe("#FFFFFF");
  });

  it("tolerates hex values without a leading '#'", () => {
    expect(getContrastingTextColor("FFFFFF")).toBe("#1F2937");
  });

  it("falls back to dark text for empty input", () => {
    expect(getContrastingTextColor("")).toBe("#1F2937");
  });
});
