import { beforeEach, describe, expect, it, vi } from "vitest";

const data = vi.hoisted(() => ({ users: {} }));
vi.mock("electron-store", () => ({
  default: class {
    get(key) {
      return key.split(".").reduce((o, k) => o?.[k], data);
    }
    set(key, value) {
      data.users[key.split(".")[1]] = value;
    }
  },
}));
const { getFeatures, setFeature, maskMetadata } = await import("./features.js");

beforeEach(() => (data.users = {}));

describe("AI feature switches", () => {
  it("are all on by default and kept per profile", () => {
    expect(Object.values(getFeatures(1)).every(Boolean)).toBe(true);
    setFeature(1, "summary", false);
    expect(getFeatures(1).summary).toBe(false);
    expect(getFeatures(1).title).toBe(true);
    expect(getFeatures(2).summary).toBe(true);
    setFeature(1, "summary", true);
    expect(getFeatures(1).summary).toBe(true);
  });

  it("reject an unknown feature", () => {
    expect(() => setFeature(1, "nope", true)).toThrow();
  });

  it("mask the fields of a switched-off feature with the entry's own", () => {
    const f = { title: false, mood: true, feelings: false };
    const out = maskMetadata(
      { title: "AI", mood_score: 4, mood_tags: ["Calm"] },
      { title: "Mine", mood_tags: ["Sad"] },
      f,
    );
    expect(out).toEqual({ title: "Mine", mood_score: 4, mood_tags: ["Sad"] });
  });
});
