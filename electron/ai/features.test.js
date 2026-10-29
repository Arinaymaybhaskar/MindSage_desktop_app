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
const { getFeatures, setFeature, metadataOn, metadataParts } =
  await import("./features.js");

beforeEach(() => (data.users = {}));

describe("AI feature switches", () => {
  it("are enrich, feelings and suggestions, all on by default and per profile", () => {
    expect(getFeatures(1)).toEqual({
      enrich: true,
      feelings: true,
      suggestions: true,
    });
    setFeature(1, "enrich", false);
    expect(getFeatures(1).enrich).toBe(false);
    expect(getFeatures(1).feelings).toBe(true);
    expect(getFeatures(2).enrich).toBe(true);
    setFeature(1, "enrich", true);
    expect(getFeatures(1).enrich).toBe(true);
  });

  it("reject an unknown feature, the old mood switch included (KAN-437)", () => {
    expect(() => setFeature(1, "nope", true)).toThrow();
    expect(() => setFeature(1, "mood", false)).toThrow();
  });

  it("ask the metadata call for only what is switched on", () => {
    const f = { enrich: false, feelings: true, suggestions: true };
    expect(metadataParts(f)).toEqual({ enrich: false, feelings: true });
    expect(metadataOn(f)).toBe(true);
    expect(metadataOn({ ...f, feelings: false })).toBe(false);
  });
});
