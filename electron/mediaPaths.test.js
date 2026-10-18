import { describe, expect, it } from "vitest";
import path from "node:path";
import { isInside, planFileRemoval } from "./mediaPaths.js";

const base = path.resolve("/data/MindSage/media");

describe("isInside", () => {
  it("accepts files in the media folder and its subfolders", () => {
    expect(isInside(base, path.join(base, "a.jpg"))).toBe(true);
    expect(isInside(base, path.join(base, "profile", "b.png"))).toBe(true);
  });

  it("refuses the folder itself, siblings, parents and traversal", () => {
    expect(isInside(base, base)).toBe(false);
    expect(
      isInside(base, path.resolve("/data/MindSage/media-evil/a.jpg")),
    ).toBe(false);
    expect(isInside(base, path.resolve("/data/MindSage/mind-sage.db"))).toBe(
      false,
    );
    expect(isInside(base, path.join(base, "..", "mind-sage.db"))).toBe(false);
    expect(isInside(base, path.join(base, "x", "..", "..", "secret"))).toBe(
      false,
    );
    expect(isInside(base, "/etc/passwd")).toBe(false);
  });

  it("refuses anything that is not a usable path", () => {
    for (const bad of [undefined, null, "", 42, {}]) {
      expect(isInside(base, bad)).toBe(false);
    }
    expect(isInside("", path.join(base, "a.jpg"))).toBe(false);
  });
});

describe("planFileRemoval", () => {
  it("removes our media, refuses the rest, skips blanks and repeats", () => {
    const mine = path.join(base, "photo.jpg");
    const plan = planFileRemoval(base, [
      mine,
      mine,
      null,
      undefined,
      "",
      "/etc/passwd",
      path.join(base, "..", "mind-sage.db"),
    ]);
    expect(plan.remove).toEqual([mine]);
    expect(plan.refused).toHaveLength(2);
  });

  it("copes with no keys at all", () => {
    expect(planFileRemoval(base, undefined)).toEqual({
      remove: [],
      refused: [],
    });
  });
});
