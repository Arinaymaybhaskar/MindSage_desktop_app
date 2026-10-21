import { describe, expect, it } from "vitest";
import { BUILTIN_MODELS, defaultChatModel, fitsInMemory } from "./models.js";

const GiB = 2 ** 30;

describe("built-in model choice by memory", () => {
  it("gives an 8 GB PC the lighter chat model and 16 GB the 3B", () => {
    expect(defaultChatModel(7.8 * GiB)).toBe("qwen-2.5-1.5b");
    expect(defaultChatModel(15.8 * GiB)).toBe("llama-3.2-3b");
  });

  it("refuses a model that leaves no room for the OS and the app", () => {
    const { bytes } = BUILTIN_MODELS["llama-3.2-3b"];
    expect(fitsInMemory(bytes, 4 * GiB)).toBe(false);
    expect(fitsInMemory(bytes, 8 * GiB)).toBe(true);
  });

  it("pins every download to a revision and a SHA-256", () => {
    for (const spec of Object.values(BUILTIN_MODELS)) {
      expect(spec.url).toMatch(/\/resolve\/[0-9a-f]{40}\//);
      expect(spec.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
