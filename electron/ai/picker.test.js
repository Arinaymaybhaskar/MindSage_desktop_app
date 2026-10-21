import { describe, expect, it } from "vitest";
import { BUILTIN_MODELS } from "./models.js";
import { downloadWarning, modelBars, recommend } from "./picker.js";

const GiB = 2 ** 30;

describe("recommendation from memory", () => {
  it("8 GB: Qwen 1.5B for summaries only, feelings left to the classifier", () => {
    expect(recommend(7.8 * GiB)).toEqual({
      chat: "qwen-2.5-1.5b",
      metadata: null,
      summary: "qwen-2.5-1.5b",
      feelings: "classifier",
    });
  });

  it.each([15.8, 31.8])(
    "%s GB: 3B for mood and tags, Qwen for summaries",
    (gb) => {
      const rec = recommend(gb * GiB);
      expect(rec.metadata).toBe("llama-3.2-3b");
      expect(rec.summary).toBe("qwen-2.5-1.5b");
      expect(rec.chat).toBe("llama-3.2-3b");
      expect(rec.feelings).toBe("chat-model");
    },
  );

  it("never recommends the 8B", () => {
    for (const gb of [4, 8, 16, 32, 64]) {
      expect(Object.values(recommend(gb * GiB))).not.toContain("llama-3.1-8b");
    }
  });
});

describe("download warning", () => {
  it("warns for a model that will not fit, not for one that does", () => {
    expect(downloadWarning("llama-3.1-8b", 7.8 * GiB)).toMatch(/Llama 3.1 8B/);
    expect(downloadWarning("llama-3.1-8b", 32 * GiB)).toBeNull();
    expect(downloadWarning("llama-3.2-3b", 8 * GiB)).toBeNull();
  });
});

describe("model bars", () => {
  it("hides speed when the probe failed", () => {
    for (const row of modelBars(16 * GiB, null)) {
      expect(row.tokensPerSecond).toBeNull();
      expect(row.speedShare).toBeNull();
      expect(row.memoryShare).toBeGreaterThan(0);
    }
  });

  it("scales unprobed models from the measured one and flags the 8B on request", () => {
    const rows = modelBars(16 * GiB, {
      id: "llama-3.2-3b",
      tokensPerSecond: 20,
    });
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(by["llama-3.2-3b"].speedMeasured).toBe(true);
    expect(by["qwen-2.5-1.5b"].speedMeasured).toBe(false);
    expect(by["qwen-2.5-1.5b"].tokensPerSecond).toBeGreaterThan(20);
    expect(by["qwen-2.5-1.5b"].speedShare).toBe(1);
    expect(by["llama-3.1-8b"].tokensPerSecond).toBeLessThan(20);
    expect(by["llama-3.1-8b"].onRequest).toBe(true);
    expect(by["llama-3.1-8b"].bytes).toBe(BUILTIN_MODELS["llama-3.1-8b"].bytes);
    expect(by["llama-3.2-3b"].recommendedFor).toEqual(["chat", "metadata"]);
  });
});
